import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['pg'],
  typedRoutes: false,
  /**
   * `/organizer` names the role that owns this workspace. Keep the old route working so saved
   * links, email logs, and external integrations migrate without becoming dead ends.
   */
  async redirects() {
    return [
      { source: '/admin', destination: '/organizer', permanent: true },
      { source: '/admin/:path*', destination: '/organizer/:path*', permanent: true },
    ];
  },
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
      /**
       * `AD-9`. A share-link URL *is* the credential, so the headers exist to stop it travelling.
       *
       * `Referrer-Policy: no-referrer` is the one that matters: these pages render organizer-supplied
       * outbound links — a sponsor's website, a speaker's own links, the event site — and the default
       * policy would hand the token to each of those third parties in the `Referer` header the moment
       * a reader clicked one.
       *
       * `X-Robots-Tag` backs up the per-page `robots: { index: false }` for anything that fetches the
       * URL without executing a document (a crawler following a link pasted into a public channel).
       * `no-store` keeps a shared or corporate proxy cache from retaining an unpublished programme,
       * and `frame-ancestors 'none'` is the opposite of the embed rule above on purpose: an embed
       * exists to be framed by a stranger's site, and a private preview does not.
       */
      {
        source: '/s/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        ],
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
