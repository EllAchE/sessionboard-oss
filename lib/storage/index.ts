import { getCloudflareContext } from '@opennextjs/cloudflare';
import { sum } from 'drizzle-orm';
import { env, envFlag, requireEnv } from '../env';
import { notFound } from '../errors';
import {
  POSTGRES_FILE_PRACTICAL_CEILING_BYTES,
  POSTGRES_FILE_WARNING_BYTES,
  type StorageUsage,
} from './status';

export type StoredObject = {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  sizeBytes: number;
};

export interface Storage {
  readonly name: 'r2' | 's3' | 'postgres';
  put(key: string, body: ArrayBuffer | Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject>;
  delete(key: string): Promise<void>;
}

/**
 * Reads and writes both go through the app rather than a presigned URL. That costs a hop and buys
 * the thing that matters here: a slide deck is only downloadable by someone with a role on its
 * event, checked at request time. It also keeps the R2-binding and S3 paths behaviourally
 * identical, since the binding cannot presign at all.
 */

type R2Bucket = {
  put(key: string, value: ArrayBuffer | Uint8Array, options?: unknown): Promise<unknown>;
  get(key: string): Promise<{
    body: ReadableStream<Uint8Array>;
    size: number;
    httpMetadata?: { contentType?: string };
  } | null>;
  delete(key: string): Promise<void>;
};

function r2Binding(): R2Bucket | undefined {
  try {
    return (getCloudflareContext().env as unknown as { FILES?: R2Bucket }).FILES;
  } catch {
    return undefined;
  }
}

function r2Storage(bucket: R2Bucket): Storage {
  return {
    name: 'r2',
    async put(key, body, contentType) {
      await bucket.put(key, body, { httpMetadata: { contentType } });
    },
    async get(key) {
      const object = await bucket.get(key);
      if (!object) throw notFound('That file');
      return {
        body: object.body,
        contentType: object.httpMetadata?.contentType ?? 'application/octet-stream',
        sizeBytes: object.size,
      };
    },
    async delete(key) {
      await bucket.delete(key);
    },
  };
}

/**
 * MinIO in the compose stack, or any S3-compatible endpoint self-hosted. Imported lazily so the
 * AWS SDK never lands in the Workers bundle, where the R2 binding always wins.
 */
function s3Storage(): Storage {
  const bucket = requireEnv('S3_BUCKET');

  async function client() {
    const { S3Client } = await import('@aws-sdk/client-s3');
    return new S3Client({
      region: env('S3_REGION') ?? 'us-east-1',
      endpoint: env('S3_ENDPOINT'),
      // MinIO — the compose stack and the usual self-host — only answers path-style, so that stays
      // the default. A host that requires virtual-hosted addressing sets S3_FORCE_PATH_STYLE=false.
      forcePathStyle: envFlag('S3_FORCE_PATH_STYLE', true),
      credentials: {
        accessKeyId: requireEnv('S3_ACCESS_KEY_ID'),
        secretAccessKey: requireEnv('S3_SECRET_ACCESS_KEY'),
      },
    });
  }

  return {
    name: 's3',
    async put(key, body, contentType) {
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');
      await (await client()).send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body instanceof Uint8Array ? body : new Uint8Array(body),
          ContentType: contentType,
        }),
      );
    },
    async get(key) {
      const { GetObjectCommand } = await import('@aws-sdk/client-s3');
      const object = await (await client()).send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!object.Body) throw notFound('That file');
      return {
        body: object.Body.transformToWebStream() as ReadableStream<Uint8Array>,
        contentType: object.ContentType ?? 'application/octet-stream',
        sizeBytes: object.ContentLength ?? 0,
      };
    },
    async delete(key) {
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      await (await client()).send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

/**
 * The database as an object store. Imported lazily for the same reason S3 is — the driver should
 * not load on a deployment that never reaches this branch.
 */
function postgresStorage(): Storage {
  return {
    name: 'postgres',
    async put(key, body, contentType) {
      const bytes = body instanceof Uint8Array ? body : new Uint8Array(body);
      const [{ getDb }, { fileBlob }] = await Promise.all([
        import('../../db/client'),
        import('../../db/schema'),
      ]);
      await getDb()
        .insert(fileBlob)
        .values({ storageKey: key, contentType, sizeBytes: bytes.byteLength, bytes })
        .onConflictDoUpdate({
          target: fileBlob.storageKey,
          set: { contentType, sizeBytes: bytes.byteLength, bytes },
        });
    },
    async get(key) {
      const [{ getDb }, { fileBlob }, { eq }] = await Promise.all([
        import('../../db/client'),
        import('../../db/schema'),
        import('drizzle-orm'),
      ]);
      const [row] = await getDb().select().from(fileBlob).where(eq(fileBlob.storageKey, key));
      if (!row) throw notFound('That file');
      const bytes = row.bytes;
      return {
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          },
        }),
        contentType: row.contentType,
        sizeBytes: row.sizeBytes,
      };
    },
    async delete(key) {
      const [{ getDb }, { fileBlob }, { eq }] = await Promise.all([
        import('../../db/client'),
        import('../../db/schema'),
        import('drizzle-orm'),
      ]);
      await getDb().delete(fileBlob).where(eq(fileBlob.storageKey, key));
    },
  };
}

/**
 * R2 first because a Workers deployment that has the binding should always use it. S3 next, which
 * is what the compose stack and any self-host with a bucket configure. The database last, so a
 * deployment that configured neither still accepts uploads instead of failing at the first headshot.
 */
export function getStorage(): Storage {
  const bucket = r2Binding();
  if (bucket) return r2Storage(bucket);
  return env('S3_BUCKET') ? s3Storage() : postgresStorage();
}

/** Returns deployment-wide object usage without exposing any other event's file metadata. */
export async function getStorageUsage(): Promise<StorageUsage> {
  const backend = getStorage().name;
  if (backend !== 'postgres') {
    return { backend, usedBytes: null, warningBytes: null, practicalCeilingBytes: null };
  }

  const [{ getDb }, { fileBlob }] = await Promise.all([
    import('../../db/client'),
    import('../../db/schema'),
  ]);
  const [row] = await getDb().select({ sizeBytes: sum(fileBlob.sizeBytes) }).from(fileBlob);
  return {
    backend,
    usedBytes: Number(row?.sizeBytes ?? 0),
    warningBytes: POSTGRES_FILE_WARNING_BYTES,
    practicalCeilingBytes: POSTGRES_FILE_PRACTICAL_CEILING_BYTES,
  };
}

/**
 * Keys are event-scoped and carry a random segment, so a guessed key from one event cannot address
 * an object in another and a re-upload never overwrites its predecessor.
 */
export function storageKey(eventId: string, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  const unique = crypto.randomUUID();
  return `events/${eventId}/${unique}/${safe}`;
}
