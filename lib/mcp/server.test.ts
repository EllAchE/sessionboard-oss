import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/services/public-api', () => ({
  groupByDay: vi.fn(),
  listSessions: vi.fn(),
  listSpeakers: vi.fn(),
  listSubmissions: vi.fn(),
  requireEvent: vi.fn(),
  toEventPayload: vi.fn(),
}));
vi.mock('@/lib/services/program-reconcile', () => ({ reconcileProgram: vi.fn() }));
vi.mock('@/lib/services/agent-mail', () => ({
  listAgentMailDeliveries: vi.fn(),
  listAgentMailTemplates: vi.fn(),
  previewAgentMail: vi.fn(),
  sendConfirmedAgentMail: vi.fn(),
}));

import { sendConfirmedAgentMail } from '@/lib/services/agent-mail';
import { listSessions, requireEvent, toEventPayload } from '@/lib/services/public-api';
import { handleCiceroMcpRequest, type McpEventKey } from './server';

const mockedListSessions = listSessions as unknown as ReturnType<typeof vi.fn>;
const mockedRequireEvent = requireEvent as unknown as ReturnType<typeof vi.fn>;
const mockedToEventPayload = toEventPayload as unknown as ReturnType<typeof vi.fn>;
const mockedSendConfirmedAgentMail = sendConfirmedAgentMail as unknown as ReturnType<typeof vi.fn>;

const key: McpEventKey = {
  keyId: 'key-1',
  eventId: 'event-1',
  eventSlug: 'first-settlement',
  name: 'Agent',
  scopes: ['read'],
  token: 'secret-key',
};

async function rpc(method: string, params: Record<string, unknown>, eventKey = key) {
  const response = await handleCiceroMcpRequest(
    new Request('https://cicero.test/api/v1/events/first-settlement/mcp', {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-protocol-version': '2025-06-18',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }),
    eventKey,
  );
  const body = await response.text();
  const dataLine = body.split('\n').find((line) => line.startsWith('data: '));
  return { response, body: dataLine ? JSON.parse(dataLine.slice(6)) : undefined };
}

describe('Cicero MCP server', () => {
  beforeEach(() => {
    mockedRequireEvent.mockReset().mockResolvedValue({ id: 'event-1', slug: 'first-settlement' });
    mockedToEventPayload.mockReset().mockReturnValue({
      slug: 'first-settlement',
      name: 'First Settlement',
      tagline: null,
      description: null,
      eventType: null,
      theme: null,
      timezone: 'America/New_York',
      startsOn: null,
      endsOn: null,
      startsAt: '2026-08-13T13:00:00.000Z',
      endsAt: '2026-08-14T21:00:00.000Z',
      speakerDeadlineAt: null,
      agendaDeadlineAt: null,
      websiteUrl: null,
      venueName: null,
      venueAddress: null,
    });
    mockedListSessions.mockReset().mockResolvedValue({ data: [], total: 0 });
    mockedSendConfirmedAgentMail.mockReset();
  });

  it('advertises event and agent-mail tools over streamable HTTP', async () => {
    const { response, body } = await rpc('tools/list', {});
    expect(response.status).toBe(200);
    expect(body.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'cicero_event_get',
      'cicero_sessions_list',
      'cicero_speakers_list',
      'cicero_agenda_get',
      'cicero_submissions_list',
      'cicero_mail_templates_list',
      'cicero_mail_deliveries_list',
      'cicero_mail_preview',
      'cicero_mail_send',
      'cicero_program_reconcile',
    ]);
    expect(body.result.tools[0].annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
    });
    expect(body.result.tools.at(-1).annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    });
  });

  it('calls the shared event service and returns structured content', async () => {
    const { body } = await rpc('tools/call', {
      name: 'cicero_event_get',
      arguments: {},
    });
    expect(mockedRequireEvent).toHaveBeenCalledWith('first-settlement');
    expect(body.result.structuredContent).toMatchObject({
      slug: 'first-settlement',
      name: 'First Settlement',
    });
  });

  it('refuses the program write when the event key is read-only', async () => {
    const { body } = await rpc('tools/call', {
      name: 'cicero_program_reconcile',
      arguments: { source: 'accelevents', sessions: [] },
    });
    expect(body.result).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: 'This API key does not have write access' }],
    });
  });

  it('marks mail send destructive and refuses it to a read-only event key', async () => {
    const listed = await rpc('tools/list', {});
    const sendTool = listed.body.result.tools.find(
      (tool: { name: string }) => tool.name === 'cicero_mail_send',
    );
    expect(sendTool.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
    });

    const { body } = await rpc('tools/call', {
      name: 'cicero_mail_send',
      arguments: {
        participantId: '22222222-2222-4222-8222-222222222222',
        recipientEmail: 'ada@example.test',
        templateKey: 'submission.declined',
        subject: 'Subject',
        bodyMarkdown: 'Body',
        renderedSubject: 'Subject',
        renderedBodyText: 'Body',
        confirmation: 'SEND EMAIL TO Ada Lovelace <ada@example.test>',
        confirmationDigest: 'a'.repeat(64),
      },
    });
    expect(body.result).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: 'This API key does not have write access' }],
    });
    expect(mockedSendConfirmedAgentMail).not.toHaveBeenCalled();
  });

  it('passes only the authenticated event into a confirmed write-key mail send', async () => {
    mockedSendConfirmedAgentMail.mockResolvedValue({
      channel: 'email',
      recipient: {
        participantId: '22222222-2222-4222-8222-222222222222',
        name: 'Ada Lovelace',
        email: 'ada@example.test',
      },
      templateKey: 'submission.declined',
      subject: 'Subject',
      bodyText: 'Body',
      logId: '33333333-3333-4333-8333-333333333333',
      sent: true,
    });
    const arguments_ = {
      participantId: '22222222-2222-4222-8222-222222222222',
      recipientEmail: 'ada@example.test',
      templateKey: 'submission.declined',
      subject: 'Subject source',
      bodyMarkdown: 'Body source',
      renderedSubject: 'Subject',
      renderedBodyText: 'Body',
      confirmation: 'SEND EMAIL TO Ada Lovelace <ada@example.test>',
      confirmationDigest: 'a'.repeat(64),
    };
    const { body } = await rpc(
      'tools/call',
      { name: 'cicero_mail_send', arguments: arguments_ },
      { ...key, scopes: ['read', 'write'] },
    );

    expect(mockedSendConfirmedAgentMail).toHaveBeenCalledWith({
      ...arguments_,
      eventId: 'event-1',
    });
    expect(body.result.structuredContent).toMatchObject({
      channel: 'email',
      sent: true,
      recipient: { email: 'ada@example.test' },
    });
  });
});
