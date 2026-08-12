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

let pool: Pool | undefined;

function connectionString(): string {
  const hyperdrive = (globalThis as { HYPERDRIVE?: { connectionString: string } }).HYPERDRIVE;
  const url = hyperdrive?.connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set and no Hyperdrive binding is present');
  }
  return url;
}

export function getDb(): Database {
  if (!pool) {
    pool = new Pool({
      connectionString: connectionString(),
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    });
  }
  return drizzle(pool, { schema, casing: 'snake_case' });
}

export { schema };
