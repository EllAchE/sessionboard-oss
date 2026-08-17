import { describe, expect, it } from 'vitest';
import nextConfig from './next.config';

describe('organizer route compatibility', () => {
  it('redirects the former admin namespace to the organizer namespace', async () => {
    expect(nextConfig.redirects).toBeTypeOf('function');

    const redirects = await nextConfig.redirects!();

    expect(redirects).toContainEqual({
      source: '/admin',
      destination: '/organizer',
      permanent: true,
    });
    expect(redirects).toContainEqual({
      source: '/admin/:path*',
      destination: '/organizer/:path*',
      permanent: true,
    });
  });
});

describe('public API CORS', () => {
  it('lets a cross-origin caller preflight and call every /api/v1 route', async () => {
    expect(nextConfig.headers).toBeTypeOf('function');

    const headerGroups = await nextConfig.headers!();
    const apiGroup = headerGroups.find((group) => group.source === '/api/v1/:path*');

    expect(apiGroup).toBeDefined();
    const headers = Object.fromEntries(apiGroup!.headers.map(({ key, value }) => [key, value]));

    expect(headers['Access-Control-Allow-Origin']).toBe('*');
    expect(headers['Access-Control-Allow-Methods']).toContain('POST');
    expect(headers['Access-Control-Allow-Headers']).toContain('Authorization');
  });
});
