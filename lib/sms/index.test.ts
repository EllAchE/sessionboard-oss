import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type LogRow = {
  id: string;
  eventId: string | null;
  toPhone: string;
  fromPhone: string;
  body: string;
  templateKey: string | null;
  status: 'queued' | 'sent' | 'delivered' | 'undelivered' | 'failed';
  error: string | null;
  providerMessageId: string | null;
  sentAt: Date | null;
  statusUpdatedAt: Date | null;
};

const state = vi.hoisted(() => ({ rows: [] as LogRow[], nextId: 1, consent: true }));

vi.mock('./consent', () => ({
  hasActiveSmsConsent: vi.fn(async () => state.consent),
}));

vi.mock('../../db/client', () => ({
  getDb: () => ({
    insert: () => ({
      values: (
        values: Omit<LogRow, 'id' | 'error' | 'providerMessageId' | 'sentAt' | 'statusUpdatedAt'>,
      ) => ({
        returning: async () => {
          const row: LogRow = {
            id: `sms-${state.nextId++}`,
            error: null,
            providerMessageId: null,
            sentAt: null,
            statusUpdatedAt: null,
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
    state.consent = true;
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

  it('keeps public test mode on log even when Twilio is fully configured', async () => {
    vi.stubEnv('CICERO_PUBLIC_TEST_MODE', 'true');
    vi.stubEnv('SMS_TRANSPORT', 'twilio');
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC_test');
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'secret');
    vi.stubEnv('SMS_FROM', '+15550000000');
    vi.stubEnv('APP_URL', 'https://cicero.example');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    expect(activeSmsTransportName()).toBe('log');
    expect((await sendSms({ to: '+15551234567', body: 'Reminder' })).sent).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps Twilio off when its signed callbacks have no public HTTPS origin', async () => {
    vi.stubEnv('SMS_TRANSPORT', 'twilio');
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC_test');
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'secret');
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    expect(activeSmsTransportName()).toBe('log');
    expect((await sendSms({ to: '+15551234567', body: 'Reminder' })).sent).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('dispatches through Twilio and records the provider message id on success', async () => {
    vi.stubEnv('SMS_TRANSPORT', 'twilio');
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC_test');
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'secret');
    vi.stubEnv('SMS_FROM', '+15550000000');
    vi.stubEnv('APP_URL', 'https://cicero.example');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ sid: 'SM_test' }), { status: 201 })),
    );

    expect(activeSmsTransportName()).toBe('twilio');

    const result = await sendSms({ to: '+15551234567', body: 'Session update' });

    expect(result.sent).toBe(true);
    expect(state.rows[0]).toMatchObject({ status: 'sent', providerMessageId: 'SM_test' });
    const request = vi.mocked(fetch).mock.calls[0][1];
    expect(String(request?.body)).toContain(
      'StatusCallback=https%3A%2F%2Fcicero.example%2Fapi%2Fwebhooks%2Ftwilio%2Fstatus',
    );
  });

  it('logs and suppresses a send without an active consent record', async () => {
    state.consent = false;
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await sendSms({ to: '(415) 867-5310', body: 'Session update' });

    expect(result.sent).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(state.rows[0]).toMatchObject({
      toPhone: '+14158675310',
      status: 'failed',
      error: 'SMS suppressed: this phone number has not opted in',
    });
  });

  it('marks the row failed, with the error attached, when Twilio rejects the send', async () => {
    vi.stubEnv('SMS_TRANSPORT', 'twilio');
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC_test');
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'secret');
    vi.stubEnv('SMS_FROM', '+15550000000');
    vi.stubEnv('APP_URL', 'https://cicero.example');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('bad number', { status: 400 })),
    );

    const result = await sendSms({ to: '+15551234567', body: 'Session update' });

    expect(result.sent).toBe(false);
    expect(state.rows[0].status).toBe('failed');
    expect(state.rows[0].error).toContain('400');
  });

  it('never throws even when the transport rejects', async () => {
    vi.stubEnv('SMS_TRANSPORT', 'twilio');
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC_test');
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'secret');
    vi.stubEnv('APP_URL', 'https://cicero.example');
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
