import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['pg'],
  experimental: {
    typedRoutes: false,
  },
};

export default nextConfig;
