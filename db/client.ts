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
function hyperdriveConnectionString(): string | undefined {
  try {
    return getCloudflareContext().env.HYPERDRIVE?.connectionString;
  } catch {
    return undefined;
  }
}

function build(connectionString: string, max: number): Database {
  return drizzle(new Pool({ connectionString, max }), { schema, casing: 'snake_case' });
}

let nodePool: Database | undefined;

export function getDb(): Database {
  const hyperdrive = hyperdriveConnectionString();
  if (hyperdrive) {
    // Not cached, deliberately. A workerd socket belongs to the request that opened it, so a
    // module-scoped pool survives into the next request on a warm isolate and every query on it
    // hangs until the runtime cancels it — a reliable every-other-request 500. Hyperdrive is
    // itself the pool, which is what makes one short-lived connection per request the right shape.
    return build(hyperdrive, 1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set and no Hyperdrive binding is present');
  }
  nodePool ??= build(url, Number(process.env.DATABASE_POOL_MAX ?? 5));
  return nodePool;
}

export { schema };
