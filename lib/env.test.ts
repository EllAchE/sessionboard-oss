import { afterEach, describe, expect, it, vi } from 'vitest';

const { getCloudflareContext } = vi.hoisted(() => ({
  getCloudflareContext: vi.fn(),
}));

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext }));

import { env } from './env';

describe('env', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    getCloudflareContext.mockReset();
  });

  it('prefers local process env over wrangler vars during development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    getCloudflareContext.mockReturnValue({
      env: { APP_URL: 'https://cicero.example.workers.dev' },
    });

    expect(env('APP_URL')).toBe('http://localhost:3000');
  });

  it('uses only Worker vars in a deployed Cloudflare context', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    getCloudflareContext.mockReturnValue({
      env: { APP_URL: 'https://cicero.example.workers.dev' },
    });

    expect(env('APP_URL')).toBe('https://cicero.example.workers.dev');
  });

  it('uses process env when no Cloudflare context exists', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_URL', 'https://self-hosted.example.com');
    getCloudflareContext.mockImplementation(() => {
      throw new Error('No Cloudflare context');
    });

    expect(env('APP_URL')).toBe('https://self-hosted.example.com');
  });
});
