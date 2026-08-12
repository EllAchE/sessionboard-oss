import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

/**
 * Workers cannot run migrations at boot the way a container entrypoint can, so both targets apply
 * them through this script: a `predeploy` step on Cloudflare, the entrypoint self-hosted.
 */
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is required to run migrations');
}

const pool = new Pool({ connectionString: url, max: 1 });
await migrate(drizzle(pool), { migrationsFolder: './db/migrations' });
await pool.end();
console.error('migrations applied');
