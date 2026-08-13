import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { sponsor } from '../../db/schema';
import type { AppError } from '../errors';
import { isAppError } from '../errors';
import type { EventContext } from '../context';
import {
  createSponsor,
  eventHasSponsors,
  isPublicSponsorLogo,
  isSponsorKind,
  listPublicSponsors,
  removeSponsor,
  reorderSponsors,
  setSponsorStatus,
  sponsorInput,
  updateSponsor,
} from './sponsors';

/**
 * `E-7`. The behaviours worth protecting are the ones a naive implementation gets wrong: a website
 * field that accepts `javascript:` and becomes a stored XSS on whatever renders the link, a kind
 * change that leaves a row holding a position in a list it was never ranked against, and a reorder
 * that renumbers one kind's list using the other's ranks.
 *
 * Asserted against a recording stand-in for the database, in the shape `settings.test.ts`
 * established, so a test can check *which* rows were written — renumbering all forty rows on every
 * nudge is a different bug from renumbering none.
 *
 * Cross-kind name uniqueness is a database property rather than a service one: the fake ignores
 * `where`, so it cannot prove a `kind`-scoped lookup. `db/migrations/sponsor-entities.test.ts` pins
 * the constraint's shape, and it was exercised against real Postgres on the upgrade path.
 */

type Recorder = {
  /** Rows a `select … from(table)` reads back. */
  rows: Map<unknown, unknown[]>;
  /** Rows an `insert`/`update … returning()` hands back. */
  returning: Map<unknown, unknown[]>;
  /**
   * Keyed by table name. A single value answers every lookup; an array is a queue, consumed one
   * call at a time, which is what separates `requireSponsor` from the `assertNameFree` that follows
   * it — both reach the same `findFirst` and the fake cannot tell them apart by their `where`.
   */
  findFirst: Map<string, unknown>;
  updates: Array<{ table: unknown; values: Record<string, unknown> }>;
  inserts: Array<{ table: unknown; values: unknown }>;
  deletes: unknown[];
  selectWheres: unknown[];
  findFirstWheres: unknown[];
};

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('../../db/client', () => ({ getDb: () => state.db }));

function recorder(): Recorder {
  return {
    rows: new Map(),
    returning: new Map(),
    findFirst: new Map(),
    updates: [],
    inserts: [],
    deletes: [],
    selectWheres: [],
    findFirstWheres: [],
  };
}

/** Chainable and awaitable at any point, which is the only shape of drizzle this file uses. */
function fakeDb(rec: Recorder) {
  /** No projection argument: unlike `settings.ts`, nothing here issues a `count(*)`. */
  const select = () => {
    let table: unknown = null;
    const builder = {
      from(next: unknown) {
        table = next;
        return builder;
      },
      where: (where: unknown) => {
        rec.selectWheres.push(where);
        return builder;
      },
      orderBy: () => builder,
      then: (onOk: (value: unknown[]) => unknown, onErr?: (reason: unknown) => unknown) =>
        Promise.resolve(rec.rows.get(table) ?? []).then(onOk, onErr),
    };
    return builder;
  };

  const returned = (table: unknown) => rec.returning.get(table) ?? rec.rows.get(table) ?? [];

  const update = (table: unknown) => {
    const builder = {
      set(values: Record<string, unknown>) {
        rec.updates.push({ table, values });
        return builder;
      },
      where: () => builder,
      returning: () => Promise.resolve(returned(table)),
      then: (onOk: (value: unknown) => unknown, onErr?: (reason: unknown) => unknown) =>
        Promise.resolve(null).then(onOk, onErr),
    };
    return builder;
  };

  const insert = (table: unknown) => {
    const builder = {
      values(values: unknown) {
        rec.inserts.push({ table, values });
        return builder;
      },
      returning: () => Promise.resolve(returned(table)),
    };
    return builder;
  };

  const remove = (table: unknown) => {
    const builder = {
      where: () => builder,
      then: (onOk: (value: unknown) => unknown, onErr?: (reason: unknown) => unknown) => {
        rec.deletes.push(table);
        return Promise.resolve(null).then(onOk, onErr);
      },
    };
    return builder;
  };

  const query = new Proxy(
    {},
    {
      get: (_target, name: string) => ({
        findFirst: async (args?: { where?: unknown }) => {
          if (args?.where) rec.findFirstWheres.push(args.where);
          const held = rec.findFirst.get(name);
          if (Array.isArray(held)) return held.shift() ?? null;
          return held ?? null;
        },
      }),
    },
  );

  return { select, update, insert, delete: remove, query };
}

const EVENT_ID = 'event-1';

function context(roles: EventContext['roles'] = ['organizer']): EventContext {
  return {
    actor: {
      userId: 'user-1',
      email: 'chair@example.test',
      name: 'Chair',
      impersonatedByUserId: null,
    },
    eventId: EVENT_ID,
    roles,
  };
}

async function rejection(work: Promise<unknown>): Promise<AppError> {
  try {
    await work;
  } catch (error) {
    if (isAppError(error)) return error;
    throw error;
  }
  throw new Error('expected the call to be refused');
}

const EXISTING = {
  id: 'sponsor-b',
  eventId: EVENT_ID,
  kind: 'sponsor',
  status: 'draft',
  name: 'Fabrica Vitraria',
};

const SPONSOR_ROWS = [
  { id: 'sponsor-a', position: 0 },
  { id: 'sponsor-b', position: 1 },
  { id: 'sponsor-c', position: 2 },
];

let rec: Recorder;

beforeEach(() => {
  rec = recorder();
  rec.findFirst.set('sponsor', EXISTING);
  rec.rows.set(sponsor, SPONSOR_ROWS);
  state.db = fakeDb(rec);
});

const dialect = new PgDialect();

function compiled(where: unknown) {
  return dialect.sqlToQuery(where as Parameters<PgDialect['sqlToQuery']>[0]);
}

describe('sponsorInput', () => {
  const valid = { kind: 'sponsor', name: 'Fabrica Vitraria' };

  it('requires a name', () => {
    const result = sponsorInput.safeParse({ ...valid, name: '  ' });
    expect(result.success).toBe(false);
  });

  it('takes only the two kinds', () => {
    expect(sponsorInput.safeParse({ ...valid, kind: 'patron' }).success).toBe(false);
    expect(sponsorInput.safeParse({ ...valid, kind: 'exhibitor' }).success).toBe(true);
    expect(isSponsorKind('sponsor')).toBe(true);
    expect(isSponsorKind('patron')).toBe(false);
  });

  /**
   * The one that matters. This value is rendered as a link, so a scheme that is not http(s) is a
   * stored XSS rather than a broken URL.
   */
  it('refuses a javascript: website', () => {
    const result = sponsorInput.safeParse({ ...valid, websiteUrl: 'javascript:alert(1)' });
    expect(result.success).toBe(false);
  });

  it('refuses other non-web schemes', () => {
    for (const value of ['data:text/html,<script>', 'file:///etc/passwd', 'vbscript:msgbox']) {
      expect(sponsorInput.safeParse({ ...valid, websiteUrl: value }).success, value).toBe(false);
    }
  });

  /** Organizers type `example.com`, and rejecting that would be pedantry rather than safety. */
  it('adds a scheme to a bare domain', () => {
    const result = sponsorInput.parse({ ...valid, websiteUrl: 'fabrica.example' });
    expect(result.websiteUrl).toBe('https://fabrica.example');
  });

  it('keeps an http website as typed and blanks an empty one', () => {
    expect(sponsorInput.parse({ ...valid, websiteUrl: 'http://fabrica.example' }).websiteUrl).toBe(
      'http://fabrica.example',
    );
    expect(sponsorInput.parse({ ...valid, websiteUrl: '   ' }).websiteUrl).toBeNull();
  });

  it('refuses a logo reference that is not a uuid', () => {
    expect(sponsorInput.safeParse({ ...valid, logoFileId: 'not-a-uuid' }).success).toBe(false);
    expect(
      sponsorInput.safeParse({ ...valid, logoFileId: '3f1c9b52-7a4d-4e18-9c2b-5d6e8f0a1b23' })
        .success,
    ).toBe(true);
  });

  it('trims the optional fields to null rather than empty strings', () => {
    const parsed = sponsorInput.parse({ ...valid, tier: '  ', description: '', boothLocation: ' ' });
    expect(parsed.tier).toBeNull();
    expect(parsed.description).toBeNull();
    expect(parsed.boothLocation).toBeNull();
  });
});

describe('createSponsor', () => {
  it('appends the new row at the end of its own list', async () => {
    rec.findFirst.set('sponsor', null);
    rec.rows.set(sponsor, [
      { id: 'sponsor-a', position: 0 },
      { id: 'sponsor-b', position: 1 },
    ]);
    rec.returning.set(sponsor, [
      {
        id: 'sponsor-new',
        kind: 'sponsor',
        name: 'Officina Ferraria',
        tier: 'Gold',
        websiteUrl: null,
        description: null,
        boothLocation: null,
        logoFileId: null,
        position: 2,
      },
    ]);

    const created = await createSponsor(context(), {
      kind: 'sponsor',
      name: 'Officina Ferraria',
      tier: 'Gold',
    });
    expect(created.position).toBe(2);
    expect(rec.inserts).toHaveLength(1);
    expect(rec.inserts[0].values).toMatchObject({
      eventId: EVENT_ID,
      kind: 'sponsor',
      name: 'Officina Ferraria',
      position: 2,
    });
  });

  /** The unique constraint is reported against the field, not surfaced as a driver error. */
  it('refuses a name already taken within the same kind, and names the kind', async () => {
    const error = await rejection(
      createSponsor(context(), { kind: 'sponsor', name: 'Fabrica Vitraria' }),
    );
    expect(error.code).toBe('conflict');
    expect(error.message).toBe('A sponsor called Fabrica Vitraria already exists');
    expect(error.details).toMatchObject({ name: 'Already in use' });
    expect(rec.inserts).toHaveLength(0);
  });

  it('says exhibitor when the clash is an exhibitor', async () => {
    rec.findFirst.set('sponsor', { ...EXISTING, kind: 'exhibitor' });
    const error = await rejection(
      createSponsor(context(), { kind: 'exhibitor', name: 'Fabrica Vitraria' }),
    );
    expect(error.message).toBe('An exhibitor called Fabrica Vitraria already exists');
  });

  it('is closed to a reviewer', async () => {
    const error = await rejection(
      createSponsor(context(['reviewer']), { kind: 'sponsor', name: 'Officina Ferraria' }),
    );
    expect(error.code).toBe('forbidden');
    expect(rec.inserts).toHaveLength(0);
  });

  it('validates before it writes', async () => {
    const error = await rejection(
      createSponsor(context(), { kind: 'sponsor', name: 'X', websiteUrl: 'javascript:alert(1)' }),
    );
    expect(error.code).toBe('invalid');
    expect(rec.inserts).toHaveLength(0);
  });
});

describe('updateSponsor', () => {
  it('404s on a row from another event', async () => {
    rec.findFirst.set('sponsor', null);
    const error = await rejection(updateSponsor(context(), 'sponsor-x', { name: 'Renamed' }));
    expect(error.code).toBe('not_found');
  });

  /** A patch: an unsent key is left alone, because the upload route sends only `logoFileId`. */
  it('writes only the keys it was given', async () => {
    rec.findFirst.set('sponsor', [EXISTING]);
    rec.returning.set(sponsor, [{ ...EXISTING, position: 1, logoFileId: null }]);

    await updateSponsor(context(), 'sponsor-b', {
      logoFileId: '3f1c9b52-7a4d-4e18-9c2b-5d6e8f0a1b23',
    });
    expect(rec.updates).toEqual([
      { table: sponsor, values: { logoFileId: '3f1c9b52-7a4d-4e18-9c2b-5d6e8f0a1b23' } },
    ]);
  });

  /**
   * The interesting one. Sponsors and exhibitors are ranked separately, so a row that changes kind
   * has to land at the end of the list it is joining — keeping position 1 would drop it into the
   * middle of a list it has never been ranked against and collide with whatever holds that slot.
   */
  it('moves a row to the end of the new list when the kind changes', async () => {
    // requireSponsor finds the row; the name check that follows finds no clash.
    rec.findFirst.set('sponsor', [EXISTING, null]);
    rec.rows.set(sponsor, [{ id: 'exhibitor-a', position: 0 }]);
    rec.returning.set(sponsor, [{ ...EXISTING, kind: 'exhibitor', position: 1 }]);

    const updated = await updateSponsor(context(), 'sponsor-b', { kind: 'exhibitor' });

    expect(updated.kind).toBe('exhibitor');
    expect(rec.updates[0]).toEqual({
      table: sponsor,
      values: { kind: 'exhibitor', position: 1 },
    });
  });

  it('leaves the position alone when the kind is unchanged', async () => {
    rec.findFirst.set('sponsor', [EXISTING, null]);
    rec.returning.set(sponsor, [{ ...EXISTING, name: 'Renamed', position: 1 }]);

    await updateSponsor(context(), 'sponsor-b', { kind: 'sponsor', name: 'Renamed' });
    expect(rec.updates).toEqual([
      { table: sponsor, values: { kind: 'sponsor', name: 'Renamed' } },
    ]);
  });

  it('lets a row keep its own name', async () => {
    rec.findFirst.set('sponsor', [EXISTING, EXISTING]);
    rec.returning.set(sponsor, [{ ...EXISTING, tier: 'Silver', position: 1 }]);

    const updated = await updateSponsor(context(), 'sponsor-b', {
      name: 'Fabrica Vitraria',
      tier: 'Silver',
    });
    expect(updated.tier).toBe('Silver');
  });

  it('is closed to a reviewer', async () => {
    const error = await rejection(
      updateSponsor(context(['reviewer']), 'sponsor-b', { name: 'Renamed' }),
    );
    expect(error.code).toBe('forbidden');
    expect(rec.updates).toHaveLength(0);
  });
});

describe('sponsor publication', () => {
  it('creates rows as drafts unless an organizer explicitly publishes them', async () => {
    rec.findFirst.set('sponsor', null);
    rec.returning.set(sponsor, [
      {
        ...EXISTING,
        id: 'sponsor-new',
        name: 'Officina Ferraria',
        status: 'draft',
        position: 3,
      },
    ]);

    const created = await createSponsor(context(), {
      kind: 'sponsor',
      name: 'Officina Ferraria',
    });

    expect(created.status).toBe('draft');
    expect(rec.inserts[0].values).not.toHaveProperty('status');
  });

  it('lets an organizer publish and unpublish a row', async () => {
    rec.findFirst.set('sponsor', [{ ...EXISTING, status: 'draft' }, { ...EXISTING, status: 'published' }]);
    rec.returning.set(sponsor, [{ ...EXISTING, status: 'published', position: 1 }]);

    const updated = await setSponsorStatus(context(), 'sponsor-b', 'published');

    expect(updated.status).toBe('published');
    expect(rec.updates).toContainEqual({ table: sponsor, values: { status: 'published' } });
  });

  it('does not let a reviewer change publication state', async () => {
    const error = await rejection(setSponsorStatus(context(['reviewer']), 'sponsor-b', 'published'));
    expect(error.code).toBe('forbidden');
    expect(rec.updates).toHaveLength(0);
  });

  it('filters the public list and navigation presence check to published rows', async () => {
    rec.rows.set(sponsor, []);
    rec.findFirst.set('sponsor', null);

    await listPublicSponsors(EVENT_ID);
    await eventHasSponsors(EVENT_ID);

    for (const where of [rec.selectWheres.at(-1), rec.findFirstWheres.at(-1)]) {
      const query = compiled(where);
      expect(query.sql).toMatch(/"sponsor"\."event_id" = \$\d+/);
      expect(query.sql).toMatch(/"sponsor"\."status" = \$\d+/);
      expect(query.params).toContain(EVENT_ID);
      expect(query.params).toContain('published');
    }
  });

  it('authorizes logo bytes only for a published row on the event', async () => {
    rec.findFirst.set('sponsor', null);
    const fileId = '3f1c9b52-7a4d-4e18-9c2b-5d6e8f0a1b23';

    await isPublicSponsorLogo(EVENT_ID, fileId);

    const query = compiled(rec.findFirstWheres.at(-1));
    expect(query.sql).toMatch(/"sponsor"\."status" = \$\d+/);
    expect(query.params).toEqual(expect.arrayContaining([EVENT_ID, 'published', fileId]));
  });
});

describe('removeSponsor', () => {
  /**
   * Nothing in the schema points at a sponsor, so unlike `removeTrack` this needs no dependent
   * count, no `reassignTo` and no `force`. It does still have to renumber.
   */
  it('deletes and closes the gap in the list', async () => {
    rec.rows.set(sponsor, [
      { id: 'sponsor-a', position: 0 },
      { id: 'sponsor-c', position: 2 },
    ]);

    await removeSponsor(context(), 'sponsor-b');

    expect(rec.deletes).toEqual([sponsor]);
    expect(rec.updates).toEqual([{ table: sponsor, values: { position: 1 } }]);
  });

  it('404s on a row from another event', async () => {
    rec.findFirst.set('sponsor', null);
    const error = await rejection(removeSponsor(context(), 'sponsor-x'));
    expect(error.code).toBe('not_found');
    expect(rec.deletes).toHaveLength(0);
  });

  it('is closed to a reviewer', async () => {
    const error = await rejection(removeSponsor(context(['reviewer']), 'sponsor-b'));
    expect(error.code).toBe('forbidden');
    expect(rec.deletes).toHaveLength(0);
  });
});

describe('reorderSponsors', () => {
  it('writes only the rows that moved', async () => {
    await reorderSponsors(context(), 'sponsor', ['sponsor-b', 'sponsor-a', 'sponsor-c']);
    expect(rec.updates).toEqual([
      { table: sponsor, values: { position: 0 } },
      { table: sponsor, values: { position: 1 } },
    ]);
  });

  it('writes nothing when the requested order is the stored one', async () => {
    await reorderSponsors(context(), 'sponsor', ['sponsor-a', 'sponsor-b', 'sponsor-c']);
    expect(rec.updates).toHaveLength(0);
  });

  /** Ids the caller left out keep their relative order and settle after the ones it named. */
  it('keeps omitted rows after the named ones', async () => {
    await reorderSponsors(context(), 'sponsor', ['sponsor-c']);
    expect(rec.updates).toEqual([
      { table: sponsor, values: { position: 0 } },
      { table: sponsor, values: { position: 1 } },
      { table: sponsor, values: { position: 2 } },
    ]);
  });

  /**
   * The two lists are ranked separately, so renumbering one from a mixed list would give it the
   * other's ranks. Refused before anything is written.
   */
  it('refuses an id that is not in that kind list', async () => {
    const error = await rejection(
      reorderSponsors(context(), 'sponsor', ['sponsor-a', 'exhibitor-a']),
    );
    expect(error.code).toBe('invalid');
    expect(error.message).toBe('That order lists a row that is not a sponsor on this event');
    expect(rec.updates).toHaveLength(0);
  });

  it('is closed to a reviewer', async () => {
    const error = await rejection(reorderSponsors(context(['reviewer']), 'sponsor', ['sponsor-a']));
    expect(error.code).toBe('forbidden');
  });
});
