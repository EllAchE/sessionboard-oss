import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/db/client';
import { scheduledSession } from '@/db/schema';
import { dropContentFixture, seedContentFixture, type ContentFixture } from '@/db/testing';
import type { EventContext } from '@/lib/context';
import { listRevisionsForEntity } from '@/lib/services/content';

/**
 * `AD-4`, on the agenda's own mutation paths.
 *
 * The service tests prove a revision can be written; these prove the board actually writes one, and
 * writes it on the transaction rather than beside it. That last part is the whole reason the writer
 * is threaded through at all: a snapshot taken on a second connection survives the rollback of a
 * move the conflict policy refused, and the history then claims a move that never happened. Only a
 * real transaction against a real Postgres can show the difference.
 *
 * Requires DATABASE_URL and a migrated database: `bun run test:integration`.
 */

const context = vi.hoisted(() => ({ value: null as EventContext | null }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/services/events', () => ({
  currentEventContext: async () => {
    if (!context.value) throw new Error('No event context set for this test');
    return context.value;
  },
}));
/** Calendar mail and webhooks are other tickets' behaviour and want no network here. */
vi.mock('@/lib/services/agenda-mutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/agenda-mutations')>()),
  notifyIfPublished: vi.fn(),
}));
vi.mock('@/lib/services/comms', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/comms')>()),
  sendSessionInvites: vi.fn(),
}));
vi.mock('@/lib/webhooks', () => ({ emitSessionScheduled: vi.fn() }));

const actions = await import('./actions');

const fixtures: ContentFixture[] = [];

async function seed(): Promise<ContentFixture> {
  const fixture = await seedContentFixture();
  fixtures.push(fixture);
  context.value = fixture.ctx();
  return fixture;
}

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set. Start Postgres and run `bun run db:migrate` first — see README.',
    );
  }
});

afterEach(async () => {
  context.value = null;
  while (fixtures.length > 0) await dropContentFixture(fixtures.pop()!);
});

const history = (fixture: ContentFixture) =>
  listRevisionsForEntity(fixture.eventId, 'scheduled_session', fixture.sessionId);

describe('placing a session', () => {
  it('files the version from before the move', async () => {
    const fixture = await seed();

    const result = await actions.placeSessionAction({
      targetId: fixture.sessionId,
      kind: 'session',
      roomId: fixture.rooms[1].id,
      startsAt: '2026-09-10T15:00:00.000Z',
      endsAt: '2026-09-10T15:45:00.000Z',
    });

    expect(result.ok).toBe(true);
    const entries = await history(fixture);
    expect(entries).toHaveLength(1);
    expect(entries[0].summary).toBe('Moved On duties');
    expect(entries[0].revisionNumber).toBe(1);
    /** The snapshot holds where it *was*, which is what makes the move undoable. */
    expect(entries[0].snapshot.roomId).toBe(fixture.rooms[0].id);
  });

  /**
   * The rollback case. `placementTimes` refuses a slot that ends before it starts, and it does so
   * after the snapshot has been written inside the transaction — so if the snapshot were on its own
   * connection it would be sitting in the history right now.
   */
  it('leaves no history behind when the move is refused', async () => {
    const fixture = await seed();

    const result = await actions.placeSessionAction({
      targetId: fixture.sessionId,
      kind: 'session',
      roomId: fixture.rooms[1].id,
      startsAt: '2026-09-10T15:00:00.000Z',
      endsAt: '2026-09-10T14:00:00.000Z',
    });

    expect(result.ok).toBe(false);
    expect(await history(fixture)).toEqual([]);

    const row = await getDb().query.scheduledSession.findFirst({
      where: eq(scheduledSession.id, fixture.sessionId),
    });
    expect(row?.roomId).toBe(fixture.rooms[0].id);
  });
});

describe('the other agenda mutations', () => {
  it('files a revision when a session is published', async () => {
    const fixture = await seed();

    const result = await actions.setSessionStatusAction(fixture.sessionId, 'published');

    expect(result.ok).toBe(true);
    const entries = await history(fixture);
    expect(entries[0].summary).toBe('Set On duties to Published');
    expect(entries[0].snapshot.status).toBe('draft');
  });

  it('files a revision when a session is unscheduled', async () => {
    const fixture = await seed();

    const result = await actions.unscheduleSessionAction(fixture.sessionId);

    expect(result.ok).toBe(true);
    const entries = await history(fixture);
    expect(entries[0].summary).toBe('Unscheduled On duties');
    expect(entries[0].snapshot.startsAt).toBe('2026-09-10T10:00:00.000Z');
  });

  it('files a revision when a session is edited by hand', async () => {
    const fixture = await seed();

    const result = await actions.saveManualSessionAction({
      sessionId: fixture.sessionId,
      title: 'On duties, second thoughts',
      descriptionMarkdown: 'What is owed, and to whom.',
      roomId: fixture.rooms[0].id,
      trackId: fixture.tracks[0].id,
      formatId: fixture.formats[0].id,
      startsAt: '2026-09-10T10:00:00.000Z',
      endsAt: '2026-09-10T10:45:00.000Z',
      ceuCredits: '',
      clientId: '',
    });

    expect(result.ok).toBe(true);
    const entries = await history(fixture);
    expect(entries[0].summary).toBe('Edited On duties');
    expect(entries[0].snapshot.title).toBe('On duties');
    expect(entries[0].changed.map((change) => change.label)).toEqual(['Title']);
  });

  /** Numbering is per entity, so a session edited three ways counts 1, 2, 3 and not 1, 1, 1. */
  it('numbers successive edits of one session in order', async () => {
    const fixture = await seed();

    await actions.setSessionStatusAction(fixture.sessionId, 'published');
    await actions.placeSessionAction({
      targetId: fixture.sessionId,
      kind: 'session',
      roomId: fixture.rooms[1].id,
      startsAt: '2026-09-10T16:00:00.000Z',
      endsAt: '2026-09-10T16:45:00.000Z',
    });
    await actions.unscheduleSessionAction(fixture.sessionId);

    const entries = await history(fixture);
    expect(entries.map((entry) => [entry.revisionNumber, entry.summary])).toEqual([
      [3, 'Unscheduled On duties'],
      [2, 'Moved On duties'],
      [1, 'Set On duties to Published'],
    ]);
  });
});
