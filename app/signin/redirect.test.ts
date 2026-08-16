import { describe, expect, it } from 'vitest';
import { authRedirect } from './redirect';

describe('authRedirect', () => {
  it('keeps an in-app destination', () => {
    expect(authRedirect('/events/new', '/admin')).toBe('/events/new');
  });

  it('rejects absolute and protocol-relative destinations', () => {
    expect(authRedirect('https://example.com', '/admin')).toBe('/admin');
    expect(authRedirect('//example.com', '/admin')).toBe('/admin');
    expect(authRedirect('/\\example.com', '/admin')).toBe('/admin');
  });

  it('uses the flow-specific fallback when no destination is supplied', () => {
    expect(authRedirect(undefined, '/events/new')).toBe('/events/new');
  });
});
