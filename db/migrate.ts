import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

/**
 * Workers cannot run migrations at boot the way a container entrypoint can, so both targets apply
 * them through this script: `bun run cf:deploy` before the Worker goes out, the entrypoint
 * self-hosted.
 */
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is required to run migrations');
}

/**
 * `cf:deploy` migrates and then deploys unconditionally, so a `DATABASE_URL` left pointing at a
 * development database would migrate localhost and still ship the Worker — against a production
 * database nothing had migrated. The deploy path sets this flag so that mistake fails loudly here
 * instead of succeeding quietly. `db:migrate` (containers, CI, local) is deliberately unaffected.
 */
if (process.env.MIGRATE_REQUIRE_REMOTE === '1') {
  const { hostname } = new URL(url);
  if (['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'].includes(hostname)) {
    throw new Error(
      `Refusing to migrate ${hostname} on a deploy path. Export the direct production DATABASE_URL ` +
        'before running cf:deploy.',
    );
  }
}

const pool = new Pool({ connectionString: url, max: 1 });
await migrate(drizzle(pool), { migrationsFolder: './db/migrations' });
await pool.end();
console.error('migrations applied');
