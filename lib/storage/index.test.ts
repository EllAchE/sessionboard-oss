import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getCloudflareContext, s3ClientConfigs } = vi.hoisted(() => ({
  getCloudflareContext: vi.fn(),
  s3ClientConfigs: [] as Record<string, unknown>[],
}));

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext }));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    constructor(config: Record<string, unknown>) {
      s3ClientConfigs.push(config);
    }
    async send() {
      return {};
    }
  },
  PutObjectCommand: class {},
  GetObjectCommand: class {},
  DeleteObjectCommand: class {},
}));

import { getStorage } from './index';
import {
  POSTGRES_FILE_PRACTICAL_CEILING_BYTES,
  POSTGRES_FILE_WARNING_BYTES,
  postgresStoragePressure,
} from './status';

/** Drive the S3 branch far enough to build a client, and hand back the config it was built with. */
async function s3ClientConfig(): Promise<Record<string, unknown>> {
  s3ClientConfigs.length = 0;
  const storage = getStorage();
  expect(storage.name).toBe('s3');
  await storage.put('events/e/1/deck.pdf', new Uint8Array([1]), 'application/pdf');
  expect(s3ClientConfigs).toHaveLength(1);
  return s3ClientConfigs[0];
}

describe('s3 storage configuration', () => {
  beforeEach(() => {
    // No R2 binding, so getStorage falls through to the S3 branch.
    getCloudflareContext.mockImplementation(() => {
      throw new Error('No Cloudflare context');
    });
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('S3_BUCKET', 'cicero-files');
    vi.stubEnv('S3_ACCESS_KEY_ID', 'cicero');
    vi.stubEnv('S3_SECRET_ACCESS_KEY', 'cicero-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    getCloudflareContext.mockReset();
  });

  it('addresses path-style when S3_FORCE_PATH_STYLE is unset, as MinIO requires', async () => {
    expect(await s3ClientConfig()).toMatchObject({ forcePathStyle: true });
  });

  it('addresses path-style when S3_FORCE_PATH_STYLE is true', async () => {
    vi.stubEnv('S3_FORCE_PATH_STYLE', 'true');
    expect(await s3ClientConfig()).toMatchObject({ forcePathStyle: true });
  });

  it('addresses virtual-hosted when S3_FORCE_PATH_STYLE is false', async () => {
    vi.stubEnv('S3_FORCE_PATH_STYLE', 'false');
    expect(await s3ClientConfig()).toMatchObject({ forcePathStyle: false });
  });
});

describe('postgres storage pressure', () => {
  it('warns before the documented handoff point and marks the ceiling separately', () => {
    expect(postgresStoragePressure(POSTGRES_FILE_WARNING_BYTES - 1)).toBe('normal');
    expect(postgresStoragePressure(POSTGRES_FILE_WARNING_BYTES)).toBe('warning');
    expect(postgresStoragePressure(POSTGRES_FILE_PRACTICAL_CEILING_BYTES)).toBe('over');
  });
});
