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

/**
 * Without these, a database that accepts TCP but never answers — a failed-over primary, an
 * exhausted connection limit, a partition that drops packets rather than resetting — holds every
 * request open until something upstream gives up. Locally that reproduces as requests still pending
 * after 75 seconds with no response and no log line. Each bound below turns that into a prompt
 * error, which the handlers already translate into a 503: a degraded page instead of a hung tab.
 */
const CONNECT_TIMEOUT_MS = Number(process.env.DATABASE_CONNECT_TIMEOUT_MS ?? 5_000);
const STATEMENT_TIMEOUT_MS = Number(process.env.DATABASE_STATEMENT_TIMEOUT_MS ?? 15_000);
const IDLE_TIMEOUT_MS = 30_000;

function build(connectionString: string, max: number): Database {
  const pool = new Pool({
    connectionString,
    max,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    // Server-side, so it also bounds a query that is executing rather than one merely waiting to
    // start. `query_timeout` is the client-side companion for a server that never replies at all.
    statement_timeout: STATEMENT_TIMEOUT_MS,
    query_timeout: STATEMENT_TIMEOUT_MS,
  });

  // An idle pooled client erroring out — server restarted, connection dropped — is emitted on the
  // pool. `pg` treats an unhandled 'error' as fatal to the process, so without this a database
  // restart takes the whole server down with it instead of costing one pooled connection.
  pool.on('error', (error) => {
    console.error(`database pool client error: ${error.message}`);
  });

  return drizzle(pool, { schema, casing: 'snake_case' });
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
