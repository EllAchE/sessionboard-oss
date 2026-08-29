import { afterEach, describe, expect, it } from 'vitest';
import { decodeCursor, simulatedChannels } from './comms-simulator';

/**
 * The two decisions the simulator makes before it touches the database: whether a channel is worth
 * simulating at all, and whether the cursor the client handed back is one we are willing to trust.
 * Both are pure; the scope rules they gate are covered against real rows in the integration suite.
 */

const KEYS = ['MAIL_TRANSPORT', 'RESEND_API_KEY', 'MAIL_FROM', 'SMS_TRANSPORT'] as const;
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('simulatedChannels', () => {
  it('simulates both channels on a deployment that delivers nothing', () => {
    process.env.MAIL_TRANSPORT = 'log';
    process.env.SMS_TRANSPORT = 'log';

    expect(simulatedChannels()).toEqual({ email: true, sms: true });
  });

  /**
   * The self-disabling property, and the reason this reads the live transport instead of a flag of
   * its own: a real key is the off switch. Nobody has to remember to unset anything, and the two
   * channels turn off independently — the day Resend lands, SMS is still a demo.
   */
  it('stops simulating a channel the moment that channel really delivers', () => {
    process.env.MAIL_TRANSPORT = 'resend';
    process.env.RESEND_API_KEY = 're_not_a_real_key';
    process.env.MAIL_FROM = 'forum@cicero.test';
    process.env.SMS_TRANSPORT = 'log';

    expect(simulatedChannels()).toEqual({ email: false, sms: true });
  });

  /**
   * A transport that was asked for and could not be built falls back to `log` — mail is not
   * leaving, so it is still worth simulating. Reporting `email: false` here would be the one
   * genuinely misleading answer: nothing would pop up, and nothing would arrive either.
   */
  it('keeps simulating a channel whose configured transport fell back to the dev mailbox', () => {
    process.env.MAIL_TRANSPORT = 'resend';
    delete process.env.RESEND_API_KEY;

    expect(simulatedChannels().email).toBe(true);
  });
});

describe('decodeCursor', () => {
  it('round-trips a timestamp and a row id', () => {
    expect(decodeCursor('2026-08-29T12:00:00.000Z|3f1b4c0e-1c1a-4a5b-8e2f-9a0d1c2b3a44')).toEqual({
      createdAt: new Date('2026-08-29T12:00:00.000Z'),
      id: '3f1b4c0e-1c1a-4a5b-8e2f-9a0d1c2b3a44',
    });
  });

  it('treats an absent cursor as a first poll', () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor('')).toBeNull();
  });

  /**
   * The id half is interpolated into a `::uuid` cast, so anything that is not a uuid has to be
   * refused here rather than by Postgres. A rejected cursor is not an error the caller has to
   * handle: it re-anchors on `now()`, which loses a few seconds of backlog and nothing else.
   */
  it('refuses a cursor that is not a timestamp and a uuid', () => {
    expect(decodeCursor('2026-08-29T12:00:00.000Z|not-a-uuid')).toBeNull();
    expect(decodeCursor("2026-08-29T12:00:00.000Z|') or true --")).toBeNull();
    expect(decodeCursor('yesterday|3f1b4c0e-1c1a-4a5b-8e2f-9a0d1c2b3a44')).toBeNull();
    expect(decodeCursor('3f1b4c0e-1c1a-4a5b-8e2f-9a0d1c2b3a44')).toBeNull();
  });
});
