import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['pg'],
  typedRoutes: false,
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
