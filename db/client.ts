import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

/**
 * One driver for both deploy targets. On Workers the connection string comes from the Hyperdrive
 * binding, which pools TCP at the edge; self-hosted it is a plain `DATABASE_URL`. Because both
 * paths are `pg` + `drizzle-orm/node-postgres`, the hosting choice stays reversible — see
 * `docs/02-architecture.md` §1.
 */

export type Database = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Workers never exposes bindings as globals; they arrive on a per-request context that
 * `getCloudflareContext` throws for when absent, which is the normal case under `next start`,
 * `tsx` scripts and vitest. Absence is therefore the self-hosted path, not an error.
 */
function cloudflareContext(): object | undefined {
  try {
    return getCloudflareContext();
  } catch {
    return undefined;
  }
}

function build(connectionString: string, max: number): Database {
  return drizzle(new Pool({ connectionString, max }), { schema, casing: 'snake_case' });
}

let nodePool: Database | undefined;

/**
 * A workerd Hyperdrive socket belongs to the request that opened it, so a module-scoped pool
 * survives into the next request on a warm isolate and every query on it hangs until the runtime
 * cancels it — a reliable every-other-request 500. That is why this can never be a plain
 * module-level cache the way `nodePool` below is.
 *
 * But `getDb()` is called independently by every service function a request touches — a single
 * portal upload chains together half a dozen of them — and OpenNext's own request context is
 * already scoped the way we need: `runWithCloudflareRequestContext` runs each request inside its
 * own `AsyncLocalStorage.run`, so `getCloudflareContext()` returns the exact same object for every
 * call made while handling one request, and a fresh object (a guaranteed cache miss) for the next
 * one. Keying a `WeakMap` off that object gives one Hyperdrive connection per request — the
 * comment above always described as the goal — without ever handing a later request a Pool wired
 * to a connection Hyperdrive has already recycled. Building a brand new `Pool` (and paying for its
 * TLS/SCRAM handshake) on every single `getDb()` call inside one request was the actual bug: on a
 * write-heavy request like a file upload, that handshake tax repeated 8-10 times was enough to run
 * the request out of CPU time, which surfaces to the browser as a generic failure with no useful
 * detail.
 */
const hyperdriveDbByRequest = new WeakMap<object, Database>();

export function getDb(): Database {
  const context = cloudflareContext();
  const hyperdrive = (context as { env?: { HYPERDRIVE?: { connectionString?: string } } } | undefined)?.env
    ?.HYPERDRIVE?.connectionString;
  if (context && hyperdrive) {
    const cached = hyperdriveDbByRequest.get(context);
    if (cached) return cached;
    const db = build(hyperdrive, 1);
    hyperdriveDbByRequest.set(context, db);
    return db;
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set and no Hyperdrive binding is present');
  }
  nodePool ??= build(url, Number(process.env.DATABASE_POOL_MAX ?? 5));
  return nodePool;
}

export { schema };
