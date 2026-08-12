import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['pg'],
  typedRoutes: false,
  /**
   * `G-1`–`G-3`. The embed routes exist to be framed by somebody else's event website, so they opt
   * out of the same-origin framing default explicitly rather than inheriting whatever a proxy adds.
   */
  async headers() {
    return [
      {
        source: '/embed/:path*',
        headers: [{ key: 'Content-Security-Policy', value: 'frame-ancestors *' }],
      },
      {
        source: '/embed.js',
        headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }],
      },
    ];
  },
};

export default nextConfig;

/**
 * Without this, `next dev` runs with no Cloudflare bindings at all and every Hyperdrive or R2 read
 * falls through to its self-hosted branch. The dev guard matters: this call starts a miniflare that
 * binds a local port, and unguarded it does so on every `next build` too.
 */
if (process.env.NODE_ENV === 'development') {
  void initOpenNextCloudflareForDev();
}
