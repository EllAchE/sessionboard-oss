/**
 * THROWAWAY SPIKE PROBE — W0b Cloudflare gate.
 *
 * Proves `pg` + `drizzle-orm/node-postgres` survives the Workers runtime under
 * `nodejs_compat` and reads through the Hyperdrive binding. Delete once a real
 * page exercises the same path; nothing may import from here.
 */
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';

export const dynamic = 'force-dynamic';

type ProbeRow = {
  server_version: string;
  db: string;
  who: string;
  at: string;
  table_count: number;
};

function bindingDiscovery() {
  const fromGlobal = (globalThis as { HYPERDRIVE?: { connectionString?: string } }).HYPERDRIVE;
  return {
    'globalThis.HYPERDRIVE': fromGlobal === undefined ? 'UNDEFINED' : typeof fromGlobal,
    'globalThis.HYPERDRIVE.connectionString': fromGlobal?.connectionString ? 'present' : 'UNDEFINED',
    'process.env.DATABASE_URL': process.env.DATABASE_URL ? 'present' : 'UNDEFINED',
    'getCloudflareContext().env.HYPERDRIVE': cloudflareHyperdrive(),
  };
}

function cloudflareHyperdrive(): string {
  try {
    return getCloudflareContext().env.HYPERDRIVE ? 'present' : 'UNDEFINED';
  } catch (error) {
    return `THROWS (${error instanceof Error ? error.message.split('\n')[0] : 'unknown'})`;
  }
}

async function probe() {
  try {
    const db = getDb();
    const result = await db.execute<ProbeRow>(sql`
      select
        version()                                     as server_version,
        current_database()                            as db,
        current_user                                  as who,
        now()::text                                   as at,
        (select count(*)::int from information_schema.tables
          where table_schema = 'public')              as table_count
    `);
    // A second, independently acquired handle — one render calls several services.
    const second = await getDb().execute<{ n: number }>(sql`select 2 as n`);
    return { ok: true as const, row: { ...result.rows[0]!, second_handle: second.rows[0]?.n } };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? (error.stack ?? error.message) : String(error),
    };
  }
}

export default async function DbProbePage() {
  const result = await probe();
  return (
    <main style={{ padding: 48, fontFamily: 'ui-monospace, monospace' }}>
      <h1>db-probe (spike, deletable)</h1>
      <p>runtime: {typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'}</p>
      <pre id="probe-bindings">{JSON.stringify(bindingDiscovery(), null, 2)}</pre>
      {result.ok ? (
        <pre id="probe-ok">{JSON.stringify(result.row, null, 2)}</pre>
      ) : (
        <pre id="probe-error" style={{ color: 'crimson', whiteSpace: 'pre-wrap' }}>
          {result.error}
        </pre>
      )}
    </main>
  );
}
