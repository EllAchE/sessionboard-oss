import { afterEach, describe, expect, it, vi } from 'vitest';

const { getCloudflareContext } = vi.hoisted(() => ({
  getCloudflareContext: vi.fn(),
}));

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext }));

import { env, envFlag } from './env';

describe('envFlag', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    getCloudflareContext.mockReset();
  });

  function stub(value: string | undefined) {
    vi.stubEnv('NODE_ENV', 'production');
    getCloudflareContext.mockImplementation(() => {
      throw new Error('No Cloudflare context');
    });
    if (value !== undefined) vi.stubEnv('CICERO_TEST_FLAG', value);
  }

  it.each(['1', 'true', 'TRUE', ' True '])('reads %o as true', (value) => {
    stub(value);
    expect(envFlag('CICERO_TEST_FLAG')).toBe(true);
  });

  it.each(['0', 'false', 'FALSE', ' False '])('reads %o as false', (value) => {
    stub(value);
    expect(envFlag('CICERO_TEST_FLAG', true)).toBe(false);
  });

  it('falls back when the variable is unset', () => {
    stub(undefined);
    expect(envFlag('CICERO_TEST_FLAG')).toBe(false);
    expect(envFlag('CICERO_TEST_FLAG', true)).toBe(true);
  });

  /**
   * The case that motivated this: a typo must not silently disable a flag that defaults to true,
   * because `S3_FORCE_PATH_STYLE=yes` turning path-style addressing off breaks every MinIO upload.
   */
  it.each(['yes', 'no', 'on', 'off', ''])('falls back on the unrecognized value %o', (value) => {
    stub(value);
    expect(envFlag('CICERO_TEST_FLAG', true)).toBe(true);
    expect(envFlag('CICERO_TEST_FLAG', false)).toBe(false);
  });
});

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
