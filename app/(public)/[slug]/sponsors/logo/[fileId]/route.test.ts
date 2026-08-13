import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

vi.mock('@/db/client', () => ({ getDb: () => state.db }));
vi.mock('@/lib/storage', () => ({ getStorage: () => state.storage }));

import { GET } from './route';

/**
 * `E-7`. This route is the only unauthenticated way to read bytes out of the `file` table for a
 * sponsor, so what it *refuses* is the whole point of it — and the interesting refusals are the ones
 * a naive implementation gets wrong. "The file is on this event" is not the boundary; that is the
 * check the private `/admin/sponsors/logo/[fileId]` makes behind an organizer gate, and copying it
 * here would turn a public URL into a reader for every deck, headshot and signed contract the event
 * has ever stored.
 *
 * The boundary is narrower: the id must be the one *currently* in the `logo_file_id` slot of a
 * sponsor row on the event named by the slug in the path.
 *
 * Because that is entirely a statement about a `where` clause, the stand-in below evaluates the
 * clause rather than ignoring it the way `lib/services/sponsors.test.ts`'s does — a fake that
 * answered every `findFirst` with the same row could not tell a correct route from one that dropped
 * the event id, which is exactly the bug worth catching.
 */

const dialect = new PgDialect();

type Row = Record<string, unknown>;

/** `logo_file_id` on the wire is `logoFileId` on the row drizzle would return. */
function camel(column: string): string {
  return column.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

/**
 * Handles the only shape this route builds: `eq`, and `and` of `eq`s. Anything else throws rather
 * than quietly passing, so a future condition cannot silently stop being enforced here.
 */
function matches(where: unknown, row: Row): boolean {
  if (!where) return true;
  const compiled = dialect.sqlToQuery(where as Parameters<PgDialect['sqlToQuery']>[0]);
  const pairs = [...compiled.sql.matchAll(/"[a-z_]+"\."([a-z_]+)" = \$(\d+)/g)];
  if (pairs.length === 0) throw new Error(`unsupported condition: ${compiled.sql}`);
  return pairs.every(
    ([, column, index]) => row[camel(column)] === compiled.params[Number(index) - 1],
  );
}

const state = vi.hoisted(() => ({ db: null as unknown, storage: null as unknown }));

function fakeDb(tables: { event: Row[]; sponsor: Row[]; file: Row[] }) {
  const table = (name: keyof typeof tables) => ({
    findFirst: (args?: { where?: unknown }) =>
      Promise.resolve(tables[name].find((row) => matches(args?.where, row))),
  });
  return { query: { event: table('event'), sponsor: table('sponsor'), file: table('file') } };
}

const FORUM = 'a0000000-0000-4000-8000-000000000001';
const LUDI = 'a0000000-0000-4000-8000-000000000002';
const LOGO = 'b0000000-0000-4000-8000-000000000001';
const RETIRED_LOGO = 'b0000000-0000-4000-8000-000000000002';
const DECK = 'b0000000-0000-4000-8000-000000000003';
const LUDI_LOGO = 'b0000000-0000-4000-8000-000000000004';
const STRAY = 'b0000000-0000-4000-8000-000000000005';

/** Everything below is one fixture, so each test differs only in what it asks for. */
function world() {
  return {
    event: [
      { id: FORUM, slug: 'forum' },
      { id: LUDI, slug: 'ludi' },
    ],
    sponsor: [
      { id: 'sponsor-1', eventId: FORUM, name: 'Aqua Marcia', logoFileId: LOGO },
      // No logo at all: a sponsor row must not make every file on the event readable.
      { id: 'sponsor-2', eventId: FORUM, name: 'Via Appia', logoFileId: null },
      { id: 'sponsor-3', eventId: LUDI, name: 'Circus Maximus', logoFileId: LUDI_LOGO },
      /**
       * A sponsor on one event whose logo column names a file stored under another. The upload route
       * cannot produce this, which is the reason to fixture it: the whole point of scoping the slot
       * lookup by event is that this route does not depend on that guarantee holding.
       */
      { id: 'sponsor-4', eventId: LUDI, name: 'Thermae', logoFileId: STRAY },
    ],
    file: [
      { id: LOGO, eventId: FORUM, storageKey: 'k/logo', contentType: 'image/png' },
      // Still in `file` after the upload route replaced it, but no slot points at it any more.
      { id: RETIRED_LOGO, eventId: FORUM, storageKey: 'k/old', contentType: 'image/png' },
      // The thing this route must never become a reader for.
      { id: DECK, eventId: FORUM, storageKey: 'k/deck', contentType: 'application/pdf' },
      { id: LUDI_LOGO, eventId: LUDI, storageKey: 'k/ludi', contentType: 'image/png' },
      { id: STRAY, eventId: FORUM, storageKey: 'k/stray', contentType: 'image/png' },
    ],
  };
}

const get = vi.fn();

function request(slug: string, fileId: string) {
  return GET(new Request(`https://cicero.test/${slug}/sponsors/logo/${fileId}`), {
    params: Promise.resolve({ slug, fileId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  state.db = fakeDb(world());
  state.storage = { get };
  get.mockResolvedValue({ body: 'bytes', contentType: 'image/png', sizeBytes: 5 });
});

describe('GET /[slug]/sponsors/logo/[fileId]', () => {
  it('serves a file id that is currently a sponsor logo on this event', async () => {
    const response = await request('forum', LOGO);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(get).toHaveBeenCalledWith('k/logo');
  });

  /** Content-addressed: the upload route writes a new file id, so the URL is safe to pin. */
  it('lets the response be cached for a year', async () => {
    const response = await request('forum', LOGO);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
  });

  it('refuses a file on this event that no sponsor points at', async () => {
    const response = await request('forum', DECK);

    expect(response.status).toBe(404);
    expect(get).not.toHaveBeenCalled();
  });

  it('refuses a logo that has since been replaced', async () => {
    const response = await request('forum', RETIRED_LOGO);

    expect(response.status).toBe(404);
    expect(get).not.toHaveBeenCalled();
  });

  it("refuses another event's sponsor logo asked for through this event's slug", async () => {
    const response = await request('forum', LUDI_LOGO);

    expect(response.status).toBe(404);
    expect(get).not.toHaveBeenCalled();
  });

  /**
   * The case that pins the event scoping on the *slot* lookup specifically, rather than leaving it
   * to the `file` lookup that follows. `STRAY` is stored under this event, so the file check passes
   * and the only thing standing between the request and the bytes is that the sponsor holding it
   * belongs to another event. Drop `eq(sponsor.eventId, …)` from `isPublicSponsorLogo` and this is
   * the test that goes red.
   */
  it('refuses a file on this event that only another event’s sponsor points at', async () => {
    const response = await request('forum', STRAY);

    expect(response.status).toBe(404);
    expect(get).not.toHaveBeenCalled();
  });

  it('still serves that logo under its own event', async () => {
    const response = await request('ludi', LUDI_LOGO);

    expect(response.status).toBe(200);
    expect(get).toHaveBeenCalledWith('k/ludi');
  });

  it('404s an unknown slug before it looks at anything else', async () => {
    const response = await request('nonesuch', LOGO);

    expect(response.status).toBe(404);
    expect(get).not.toHaveBeenCalled();
  });

  /**
   * `logo_file_id` is a `uuid` column, so comparing it to junk is a cast error rather than an empty
   * result. Guarded before the query so a probe gets the same 404 as everything else and not a 500
   * that tells it the column type.
   */
  it('404s a file id that is not a uuid, without asking the database', async () => {
    for (const junk of ['not-a-uuid', "' OR 1=1 --", '', '../../etc/passwd']) {
      const response = await request('forum', junk);
      expect(response.status).toBe(404);
    }
    expect(get).not.toHaveBeenCalled();
  });

  it('404s when the bytes are gone, rather than failing open or 500ing', async () => {
    get.mockRejectedValue(new Error('no such key'));
    const response = await request('forum', LOGO);
    expect(response.status).toBe(404);
  });

  /** An iframed microsite is a supported use, so the frame policy matches the branding route. */
  it('allows framing, the way the event branding route does', async () => {
    const response = await request('forum', LOGO);
    expect(response.headers.get('Content-Security-Policy')).toBe('frame-ancestors *');
  });
});
