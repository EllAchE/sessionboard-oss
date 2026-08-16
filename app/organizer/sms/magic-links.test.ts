import { describe, expect, it } from 'vitest';
import { carriesMagicLink, smsMailboxBody } from './magic-links';

const TOKEN = 'sms-secret';
const LINK = `https://cicero.test/auth/verify?token=${TOKEN}`;

describe('SMS mailbox magic-link handling', () => {
  it('spots a credential without carrying regex state between checks', () => {
    expect(carriesMagicLink({ body: `Open ${LINK}` })).toBe(true);
    expect(carriesMagicLink({ body: `Open ${LINK}` })).toBe(true);
    expect(carriesMagicLink({ body: 'No credential here' })).toBe(false);
  });

  it('removes every token when the recipient cannot be resolved or shown', () => {
    const second = 'second-secret';
    const result = smsMailboxBody(
      { body: `${LINK}\nhttps://cicero.test/auth/verify?next=%2Fportal&token=${second}` },
      null,
    );

    expect(result.body).toContain('/auth/verify?token=redacted');
    expect(result.body).not.toContain(TOKEN);
    expect(result.body).not.toContain(second);
    expect(result.redacted).toBe(true);
  });

  it('leaves the credential readable when the log transport is the recipient copy', () => {
    const result = smsMailboxBody({ body: `Open ${LINK}` }, 'instance-delivers-nothing');

    expect(result.body).toContain(LINK);
    expect(result.redacted).toBe(false);
  });

  it('leaves an allowed seeded-demo credential readable under a real transport', () => {
    const result = smsMailboxBody({ body: `Open ${LINK}` }, 'seeded-demo-account');

    expect(result.body).toContain(LINK);
    expect(result.redacted).toBe(false);
  });

  it('does not alter an ordinary text message', () => {
    const body = 'Your session starts at 10:00. Agenda: https://cicero.test/demo/agenda';
    expect(smsMailboxBody({ body }, null)).toEqual({ body, redacted: false });
  });

  it('recognizes a token already removed before this reader saw it', () => {
    const body = 'Open https://cicero.test/auth/verify?token=redacted';
    expect(smsMailboxBody({ body }, 'instance-delivers-nothing')).toEqual({
      body,
      redacted: true,
    });
  });
});
