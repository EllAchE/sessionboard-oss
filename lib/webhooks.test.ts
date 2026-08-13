import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  endpoints: [] as Array<Record<string, unknown>>,
  inserted: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/db/client', () => ({
  getDb: () => ({
    query: {
      webhookEndpoint: { findMany: async () => state.endpoints },
    },
    insert: () => ({
      values: (value: Record<string, unknown>) => {
        state.inserted.push(value);
        return { returning: async () => [{ id: value.id }] };
      },
    }),
    update: () => ({
      set: (value: Record<string, unknown>) => {
        state.updates.push(value);
        return { where: async () => undefined };
      },
    }),
  }),
}));

import { emitWebhook } from './webhooks';

describe('outbound webhooks', () => {
  beforeEach(() => {
    state.inserted = [];
    state.updates = [];
    state.endpoints = [
      {
        id: 'endpoint-1',
        eventId: 'event-1',
        name: 'Warehouse',
        url: 'https://hooks.example.test/cicero',
        signingSecret: 'whsec_test-secret',
        secretPrefix: 'whsec_test',
        eventTypes: ['submission.received'],
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
  });

  it('delivers a signed envelope and records success', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 204 }),
    );

    await emitWebhook('event-1', 'submission.received', { submissionId: 'submission-1' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get('x-cicero-event')).toBe('submission.received');
    expect(headers.get('x-cicero-signature')).toMatch(/^v1=[0-9a-f]{64}$/);
    expect(JSON.parse(String(init?.body))).toMatchObject({
      type: 'submission.received',
      eventId: 'event-1',
      data: { submissionId: 'submission-1' },
    });
    expect(state.inserted[0]).toMatchObject({
      eventType: 'submission.received',
      endpointId: 'endpoint-1',
    });
    expect(state.updates.at(-1)).toMatchObject({
      status: 'delivered',
      attempts: 1,
      responseStatus: 204,
    });
    fetchMock.mockRestore();
  });

  it('does not deliver event types the endpoint did not subscribe to', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await emitWebhook('event-1', 'session.scheduled', { sessionId: 'session-1' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.inserted).toEqual([]);
    fetchMock.mockRestore();
  });
});
