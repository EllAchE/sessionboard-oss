import { describe, expect, it } from 'vitest';
import { redactSensitiveMailLinks } from './redact';

describe('sensitive mail link redaction', () => {
  it('removes both sign-in and preference bearer tokens without changing ordinary links', () => {
    const source = [
      'https://cicero.test/auth/verify?token=session-secret',
      'https://cicero.test/unsubscribe?token=preference-secret',
      'https://cicero.test/agenda?token=public-filter',
    ].join('\n');
    const redacted = redactSensitiveMailLinks(source);

    expect(redacted).not.toContain('session-secret');
    expect(redacted).not.toContain('preference-secret');
    expect(redacted).toContain('/auth/verify?token=redacted');
    expect(redacted).toContain('/unsubscribe?token=redacted');
    expect(redacted).toContain('/agenda?token=public-filter');
  });

  it('redacts an HTML-escaped query token without consuming the rest of the URL', () => {
    const source = '<a href="/unsubscribe?category=task&amp;token=secret&amp;next=/portal">off</a>';
    expect(redactSensitiveMailLinks(source)).toContain(
      '/unsubscribe?category=task&amp;token=redacted&amp;next=/portal',
    );
  });
});
