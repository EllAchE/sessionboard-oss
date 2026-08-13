import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./comms', () => ({
  DEFAULT_TEMPLATES: [
    {
      key: 'submission.declined',
      name: 'Submission declined',
      subject: 'An update on {{submission.title}}',
      bodyMarkdown: 'Hi {{speaker.name}},\n\nThank you for {{submission.title}}.',
    },
  ],
  getTemplate: vi.fn(),
  listMail: vi.fn(),
  listTemplates: vi.fn(),
  previewParticipantEmail: vi.fn(),
  sendParticipantEmail: vi.fn(),
  templateVariablesUsed: vi.fn(() => []),
  unknownVariables: vi.fn(() => []),
}));

import { invalid } from '../errors';
import {
  getTemplate,
  listMail,
  listTemplates,
  previewParticipantEmail,
  sendParticipantEmail,
} from './comms';
import {
  listAgentMailDeliveries,
  previewAgentMail,
  sendConfirmedAgentMail,
} from './agent-mail';

const mockedGetTemplate = getTemplate as unknown as ReturnType<typeof vi.fn>;
const mockedListMail = listMail as unknown as ReturnType<typeof vi.fn>;
const mockedListTemplates = listTemplates as unknown as ReturnType<typeof vi.fn>;
const mockedPreviewParticipantEmail = previewParticipantEmail as unknown as ReturnType<typeof vi.fn>;
const mockedSendParticipantEmail = sendParticipantEmail as unknown as ReturnType<typeof vi.fn>;

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const PARTICIPANT_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_PARTICIPANT_ID = '33333333-3333-4333-8333-333333333333';

function participantPreview(participantId: string) {
  const other = participantId === OTHER_PARTICIPANT_ID;
  return {
    recipient: {
      participantId,
      userId: other
        ? '55555555-5555-4555-8555-555555555555'
        : '44444444-4444-4444-8444-444444444444',
      email: other ? 'grace@example.test' : 'ada@example.test',
      name: other ? 'Grace Hopper' : 'Ada Lovelace',
      notifyEmail: true,
    },
    message: {
      subject: 'An update on Analytical Engines',
      html: '<p>Rendered</p>',
      text: 'Hi Ada Lovelace,\n\nThank you for Analytical Engines.',
      missing: [],
    },
    unknown: [],
    dynamicFields: [],
  };
}

describe('agent mail confirmation boundary', () => {
  beforeEach(() => {
    mockedGetTemplate.mockReset().mockResolvedValue(undefined);
    mockedListTemplates.mockReset().mockResolvedValue([]);
    mockedListMail.mockReset().mockResolvedValue([]);
    mockedPreviewParticipantEmail
      .mockReset()
      .mockImplementation(({ participantId }: { participantId: string }) =>
        Promise.resolve(participantPreview(participantId)),
      );
    mockedSendParticipantEmail.mockReset().mockResolvedValue({
      recipient: {
        participantId: PARTICIPANT_ID,
        email: 'ada@example.test',
        name: 'Ada Lovelace',
      },
      message: {
        subject: 'An update on Analytical Engines',
        text: 'Hi Ada Lovelace,\n\nThank you for Analytical Engines.',
      },
      logId: '66666666-6666-4666-8666-666666666666',
      sent: true,
    });
  });

  it('returns exact recipient, content, and target-specific confirmation arguments', async () => {
    const preview = await previewAgentMail({
      eventId: EVENT_ID,
      participantId: PARTICIPANT_ID,
      templateKey: 'submission.declined',
    });

    expect(preview).toMatchObject({
      channel: 'email',
      recipient: {
        participantId: PARTICIPANT_ID,
        name: 'Ada Lovelace',
        email: 'ada@example.test',
        notifyEmail: true,
      },
      rendered: {
        subject: 'An update on Analytical Engines',
        bodyText: 'Hi Ada Lovelace,\n\nThank you for Analytical Engines.',
      },
      confirmation: {
        literal: 'SEND EMAIL TO Ada Lovelace <ada@example.test>',
        digest: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
    expect(preview.confirmation.sendArguments).toEqual({
      participantId: PARTICIPANT_ID,
      recipientEmail: 'ada@example.test',
      templateKey: 'submission.declined',
      subject: 'An update on {{submission.title}}',
      bodyMarkdown: 'Hi {{speaker.name}},\n\nThank you for {{submission.title}}.',
      renderedSubject: 'An update on Analytical Engines',
      renderedBodyText: 'Hi Ada Lovelace,\n\nThank you for Analytical Engines.',
      confirmation: preview.confirmation.literal,
      confirmationDigest: preview.confirmation.digest,
    });
  });

  it('sends only an unchanged preview echoed with its literal confirmation', async () => {
    const preview = await previewAgentMail({
      eventId: EVENT_ID,
      participantId: PARTICIPANT_ID,
      templateKey: 'submission.declined',
    });
    const result = await sendConfirmedAgentMail({
      eventId: EVENT_ID,
      ...preview.confirmation.sendArguments,
    });

    expect(mockedSendParticipantEmail).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      participantId: PARTICIPANT_ID,
      templateKey: 'submission.declined',
      subject: 'An update on {{submission.title}}',
      bodyMarkdown: 'Hi {{speaker.name}},\n\nThank you for {{submission.title}}.',
      expectedRecipientEmail: 'ada@example.test',
      expectedPreviewSubject: 'An update on Analytical Engines',
      expectedPreviewBodyText: 'Hi Ada Lovelace,\n\nThank you for Analytical Engines.',
    });
    expect(result).toMatchObject({ channel: 'email', sent: true });
  });

  it('rejects altered copy and a different recipient before dispatch', async () => {
    const preview = await previewAgentMail({
      eventId: EVENT_ID,
      participantId: PARTICIPANT_ID,
      templateKey: 'submission.declined',
    });

    await expect(
      sendConfirmedAgentMail({
        eventId: EVENT_ID,
        ...preview.confirmation.sendArguments,
        bodyMarkdown: 'Changed after preview',
      }),
    ).rejects.toThrow('message source no longer matches');
    await expect(
      sendConfirmedAgentMail({
        eventId: EVENT_ID,
        ...preview.confirmation.sendArguments,
        participantId: OTHER_PARTICIPANT_ID,
      }),
    ).rejects.toThrow('Confirmation must exactly equal');
    expect(mockedSendParticipantEmail).not.toHaveBeenCalled();
  });

  it('fails closed when the recipient has disabled email since preview', async () => {
    const preview = await previewAgentMail({
      eventId: EVENT_ID,
      participantId: PARTICIPANT_ID,
      templateKey: 'submission.declined',
    });
    mockedPreviewParticipantEmail.mockRejectedValueOnce(
      invalid('That recipient has email notifications disabled'),
    );

    await expect(
      sendConfirmedAgentMail({ eventId: EVENT_ID, ...preview.confirmation.sendArguments }),
    ).rejects.toThrow('email notifications disabled');
    expect(mockedSendParticipantEmail).not.toHaveBeenCalled();
  });
});

describe('agent mail delivery reads', () => {
  it('returns event-scoped metadata without message bodies, attachments, or provider ids', async () => {
    mockedListMail.mockResolvedValue([
      {
        id: '77777777-7777-4777-8777-777777777777',
        eventId: EVENT_ID,
        toEmail: 'ada@example.test',
        fromEmail: 'Cicero <mail@example.test>',
        subject: 'Hello',
        bodyHtml: '<a href="/auth/verify?token=live-secret">Open</a>',
        bodyText: '/auth/verify?token=live-secret',
        templateKey: 'submission.confirmation',
        icsBody: 'SECRET CALENDAR',
        status: 'sent',
        error: null,
        providerMessageId: 'provider-secret',
        sentAt: new Date('2026-08-13T15:00:00.000Z'),
        createdAt: new Date('2026-08-13T14:59:59.000Z'),
      },
    ]);

    const result = await listAgentMailDeliveries(EVENT_ID, 10);
    expect(mockedListMail).toHaveBeenCalledWith({ eventId: EVENT_ID, limit: 10 });
    expect(JSON.stringify(result)).not.toContain('live-secret');
    expect(JSON.stringify(result)).not.toContain('provider-secret');
    expect(JSON.stringify(result)).not.toContain('SECRET CALENDAR');
    expect(result).toEqual({
      contentRedacted: true,
      deliveries: [
        expect.objectContaining({
          toEmail: 'ada@example.test',
          status: 'sent',
          createdAt: '2026-08-13T14:59:59.000Z',
        }),
      ],
    });
  });
});
