import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { consumeMagicLink } = vi.hoisted(() => ({
  consumeMagicLink: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ consumeMagicLink }));
vi.mock('@/lib/env', () => ({ appUrl: () => 'https://public.cicero.test:8443' }));

import { GET } from './route';

function verifyRequest(token?: string): NextRequest {
  const url = new URL('/auth/verify', 'http://app:3000');
  if (token !== undefined) url.searchParams.set('token', token);
  return new NextRequest(url, {
    headers: {
      'x-forwarded-host': 'public.cicero.test:8443',
      'x-forwarded-proto': 'https',
    },
  });
}

describe('magic-link verification redirects', () => {
  beforeEach(() => {
    consumeMagicLink.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses APP_URL rather than the internal request origin and preserves a safe destination', async () => {
    consumeMagicLink.mockResolvedValue({ redirectTo: '/portal/roman-tech?tab=tasks#headshot' });

    const response = await GET(verifyRequest('valid-token'));

    expect(response.headers.get('location')).toBe(
      'https://public.cicero.test:8443/portal/roman-tech?tab=tasks#headshot',
    );
  });

  it('uses APP_URL for missing and expired link errors', async () => {
    expect((await GET(verifyRequest())).headers.get('location')).toBe(
      'https://public.cicero.test:8443/signin?error=missing',
    );

    consumeMagicLink.mockRejectedValue(new Error('expired'));
    expect((await GET(verifyRequest('expired-token'))).headers.get('location')).toBe(
      'https://public.cicero.test:8443/signin?error=expired',
    );
  });

  it('preserves the actual localhost port while developing', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    consumeMagicLink.mockResolvedValue({ redirectTo: '/organizer' });
    const request = new NextRequest('http://localhost:3001/auth/verify?token=valid-token', {
      headers: { host: 'localhost:3001' },
    });

    const response = await GET(request);

    expect(response.headers.get('location')).toBe('http://localhost:3001/organizer');
  });

  it.each([
    'https://attacker.example/path',
    '//attacker.example/path',
    '/\\attacker.example/path',
  ])('falls back locally instead of redirecting to %s', async (redirectTo) => {
    consumeMagicLink.mockResolvedValue({ redirectTo });

    const response = await GET(verifyRequest('valid-token'));

    expect(response.headers.get('location')).toBe('https://public.cicero.test:8443/organizer');
  });
});
