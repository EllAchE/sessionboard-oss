import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type LogRow = {
  id: string;
  eventId: string | null;
  toPhone: string;
  fromPhone: string;
  body: string;
  templateKey: string | null;
  status: 'queued' | 'sent' | 'failed';
  error: string | null;
  providerMessageId: string | null;
  sentAt: Date | null;
};

const state = vi.hoisted(() => ({ rows: [] as LogRow[], nextId: 1 }));

vi.mock('../../db/client', () => ({
  getDb: () => ({
    insert: () => ({
      values: (values: Omit<LogRow, 'id' | 'error' | 'providerMessageId' | 'sentAt'>) => ({
        returning: async () => {
          const row: LogRow = {
            id: `sms-${state.nextId++}`,
            error: null,
            providerMessageId: null,
            sentAt: null,
            ...values,
          };
          state.rows.push(row);
          return [{ id: row.id }];
        },
      }),
    }),
    update: () => ({
      set: (patch: Partial<LogRow>) => ({
        where: async () => {
          // The real query is `eq(smsLog.id, row.id)`; the fake applies to the most recently
          // inserted row, since every test here sends exactly one message at a time.
          const row = state.rows[state.rows.length - 1];
          Object.assign(row, patch);
        },
      }),
    }),
  }),
}));

import { sendSms, activeSmsTransportName } from './index';

/**
 * The SMS equivalent of `sendMail`: insert-then-dispatch, `queued` -> `sent`/`failed`, never throws.
 * `SMS_TRANSPORT` mirrors `MAIL_TRANSPORT`'s fallback contract — missing Twilio creds degrade to the
 * dev mailbox rather than taking the whole notification path down.
 */
describe('sendSms', () => {
  beforeEach(() => {
    state.rows = [];
    state.nextId = 1;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('defaults to the log transport and marks the row sent', async () => {
    vi.stubEnv('SMS_TRANSPORT', undefined);
    vi.stubEnv('SMS_FROM', '+15550000000');

    const result = await sendSms({ to: '+15551234567', body: 'Your talk was accepted' });

    expect(result.sent).toBe(true);
    expect(state.rows).toEqual([
      expect.objectContaining({
        id: result.id,
        toPhone: '+15551234567',
        fromPhone: '+15550000000',
        body: 'Your talk was accepted',
        status: 'sent',
      }),
    ]);
    expect(activeSmsTransportName()).toBe('log');
  });

  it('falls back to the log transport when SMS_TRANSPORT=twilio has no credentials', async () => {
    vi.stubEnv('SMS_TRANSPORT', 'twilio');
    vi.stubEnv('TWILIO_ACCOUNT_SID', undefined);
    vi.stubEnv('TWILIO_AUTH_TOKEN', undefined);

    expect(activeSmsTransportName()).toBe('log');

    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const result = await sendSms({ to: '+15551234567', body: 'Reminder' });

    expect(result.sent).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('dispatches through Twilio and records the provider message id on success', async () => {
    vi.stubEnv('SMS_TRANSPORT', 'twilio');
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC_test');
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'secret');
    vi.stubEnv('SMS_FROM', '+15550000000');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ sid: 'SM_test' }), { status: 201 })),
    );

    expect(activeSmsTransportName()).toBe('twilio');

    const result = await sendSms({ to: '+15551234567', body: 'Session update' });

    expect(result.sent).toBe(true);
    expect(state.rows[0]).toMatchObject({ status: 'sent', providerMessageId: 'SM_test' });
  });

  it('marks the row failed, with the error attached, when Twilio rejects the send', async () => {
    vi.stubEnv('SMS_TRANSPORT', 'twilio');
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC_test');
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'secret');
    vi.stubEnv('SMS_FROM', '+15550000000');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('bad number', { status: 400 })),
    );

    const result = await sendSms({ to: 'not-a-number', body: 'Session update' });

    expect(result.sent).toBe(false);
    expect(state.rows[0].status).toBe('failed');
    expect(state.rows[0].error).toContain('400');
  });

  it('never throws even when the transport rejects', async () => {
    vi.stubEnv('SMS_TRANSPORT', 'twilio');
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC_test');
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'secret');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    await expect(sendSms({ to: '+15551234567', body: 'x' })).resolves.toMatchObject({
      sent: false,
    });
  });
});
