import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '@/lib/context';
import type { EventSummary } from '@/lib/services/events';

/**
 * `reviewerSession` is the gate every reviewer route runs through, and until now nothing exercised
 * it: it reaches for a cookie store, an actor and a membership list, all of which need a request
 * scope and a database. Those three are the only impure edges, so mocking them here reaches the
 * routing and capability rules directly — no Postgres, no server runtime.
 */

const cookieGet = vi.fn<(name: string) => { value: string } | undefined>();
const currentActor = vi.fn<() => Promise<Actor | null>>();
const listEventsForUser = vi.fn<(userId: string) => Promise<EventSummary[]>>();

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: cookieGet }),
}));

vi.mock('@/lib/auth', () => ({
  currentActor: () => currentActor(),
}));

vi.mock('@/lib/services/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/events')>();
  return {
    ...actual,
    listEventsForUser: (userId: string) => listEventsForUser(userId),
  };
});

const { reviewerSession } = await import('./context');

const ACTOR: Actor = {
  userId: 'user-cicero',
  email: 'cicero@forum.example',
  name: 'Marcus Tullius Cicero',
  impersonatedByUserId: null,
};

const event = (over: Partial<EventSummary> & { id: string }): EventSummary => ({
  slug: over.id,
  name: over.id,
  tagline: null,
  timezone: 'UTC',
  startsAt: new Date('2026-09-10T00:00:00.000Z'),
  endsAt: new Date('2026-09-12T00:00:00.000Z'),
  startsOn: '2026-09-10',
  endsOn: '2026-09-12',
  roles: ['reviewer'],
  ...over,
});

beforeEach(() => {
  cookieGet.mockReset().mockReturnValue(undefined);
  currentActor.mockReset().mockResolvedValue(ACTOR);
  listEventsForUser.mockReset().mockResolvedValue([]);
});

describe('reviewerSession', () => {
  it('refuses a signed-out visitor without touching the membership list', async () => {
    currentActor.mockResolvedValue(null);

    expect(await reviewerSession()).toBeNull();
    expect(listEventsForUser).not.toHaveBeenCalled();
  });

  it('refuses a signed-in speaker who reviews nothing', async () => {
    listEventsForUser.mockResolvedValue([event({ id: 'event-speaking', roles: ['speaker'] })]);

    expect(await reviewerSession()).toBeNull();
  });

  it('resolves its own event rather than deferring to an organizer membership', async () => {
    // The regression this surface exists to avoid: a reviewer with no event cookie and no organizer
    // row still gets a session instead of being told the event does not exist.
    listEventsForUser.mockResolvedValue([event({ id: 'event-forum', roles: ['reviewer'] })]);

    const session = await reviewerSession();

    expect(session?.event.id).toBe('event-forum');
    expect(session?.ctx).toEqual({ actor: ACTOR, eventId: 'event-forum', roles: ['reviewer'] });
  });

  it('honours the event cookie when it names an event they review', async () => {
    listEventsForUser.mockResolvedValue([
      event({ id: 'event-first' }),
      event({ id: 'event-preferred' }),
    ]);
    cookieGet.mockReturnValue({ value: 'event-preferred' });

    expect((await reviewerSession())?.event.id).toBe('event-preferred');
  });

  it('falls back to the first reviewable event when the cookie names one they do not review', async () => {
    listEventsForUser.mockResolvedValue([
      event({ id: 'event-first' }),
      event({ id: 'event-speaking', roles: ['speaker'] }),
    ]);
    cookieGet.mockReturnValue({ value: 'event-speaking' });

    expect((await reviewerSession())?.event.id).toBe('event-first');
  });

  it('withholds the decision controls from a reviewer and grants them to an organizer', async () => {
    listEventsForUser.mockResolvedValue([event({ id: 'event-forum', roles: ['reviewer'] })]);
    expect((await reviewerSession())?.canDecide).toBe(false);

    listEventsForUser.mockResolvedValue([event({ id: 'event-forum', roles: ['organizer'] })]);
    expect((await reviewerSession())?.canDecide).toBe(true);
  });
});
