import { describe, expect, it } from 'vitest';
import { authRedirect, localAuthOrigin } from './redirect';

describe('authRedirect', () => {
  it('keeps an in-app destination', () => {
    expect(authRedirect('/events/new', '/admin')).toBe('/events/new');
  });

  it('rejects absolute and protocol-relative destinations', () => {
    expect(authRedirect('https://example.com', '/admin')).toBe('/admin');
    expect(authRedirect('//example.com', '/admin')).toBe('/admin');
  });

  it('uses the flow-specific fallback when no destination is supplied', () => {
    expect(authRedirect(undefined, '/events/new')).toBe('/events/new');
  });
});

describe('localAuthOrigin', () => {
  function requestHeaders(values: Record<string, string>): Pick<Headers, 'get'> {
    return { get: (name) => values[name] ?? null };
  }

  it('uses the actual local request port in development', () => {
    expect(
      localAuthOrigin(
        requestHeaders({ host: 'localhost:3002', 'x-forwarded-proto': 'http' }),
        true,
      ),
    ).toBe('http://localhost:3002');
  });

  it('prefers the forwarded host when Next supplies one', () => {
    expect(
      localAuthOrigin(
        requestHeaders({
          host: 'localhost:3000',
          'x-forwarded-host': 'localhost:3002',
        }),
        true,
      ),
    ).toBe('http://localhost:3002');
  });

  it('never trusts request host headers in production', () => {
    expect(localAuthOrigin(requestHeaders({ host: 'attacker.example' }), false)).toBeUndefined();
  });

  it('rejects a non-local host even in development', () => {
    expect(localAuthOrigin(requestHeaders({ host: 'attacker.example' }), true)).toBeUndefined();
  });
});
