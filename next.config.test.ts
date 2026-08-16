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
