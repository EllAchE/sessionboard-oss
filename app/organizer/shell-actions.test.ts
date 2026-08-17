import { beforeEach, describe, expect, it, vi } from 'vitest';
import { conflict } from '@/lib/errors';

/**
 * The create path a signed-in organizer reaches from `/events/new`. Two things here are worth
 * pinning: the success path returns *nothing* and redirects — the form has to read that as success
 * rather than dereference it — and a rejected create must come back as field-keyed details with no
 * event cookie written, because a cookie pointing at an event that was never inserted would strand
 * the whole organizer shell.
 *
 * `redirect` is thrown by the mock exactly as Next throws it, so a test that stopped the signal
 * escaping `createEventAction` would fail here rather than in a browser.
 */

class RedirectError extends Error {
  constructor(readonly to: string) {
    super(`redirect:${to}`);
  }
}

const requireCurrentActor = vi.fn();
const signOut = vi.fn();
const createEvent = vi.fn();
const listEventsForUser = vi.fn();
const cookieSet = vi.fn();

vi.mock('next/headers', () => ({ cookies: async () => ({ set: cookieSet }) }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new RedirectError(to);
  },
}));
vi.mock('@/lib/auth', () => ({
  requireCurrentActor: () => requireCurrentActor(),
  signOut: () => signOut(),
}));
vi.mock('@/lib/services/events', () => ({
  EVENT_COOKIE: 'cicero_event',
  createEvent: (...a: unknown[]) => createEvent(...a),
  listEventsForUser: (...a: unknown[]) => listEventsForUser(...a),
}));

const actions = await import('./shell-actions');

const VALUES = {
  name: 'Cascadia Systems Conf 2026',
  slug: '',
  tagline: '',
  eventType: '',
  startsAt: '2026-09-27T09:00',
  endsAt: '2026-09-27T17:00',
  timezone: 'America/Los_Angeles',
  venueName: '',
  websiteUrl: '',
};

beforeEach(() => {
  // `reset`, not `clear`: a rejection left implemented by one test would still be pending in the
  // next one and quietly weaken it.
  vi.resetAllMocks();
  requireCurrentActor.mockResolvedValue({ userId: 'user-organizer' });
  createEvent.mockResolvedValue({ id: 'event-cascadia' });
});

describe('createEventAction on the way through', () => {
  it('lands on the organizer shell instead of returning a result', async () => {
    await expect(actions.createEventAction(VALUES)).rejects.toThrow('redirect:/organizer');
  });

  it('points the event cookie at the event it just created', async () => {
    await expect(actions.createEventAction(VALUES)).rejects.toBeInstanceOf(RedirectError);

    expect(cookieSet).toHaveBeenCalledWith('cicero_event', 'event-cascadia', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
  });

  it('passes the form through as the service input, with a blank slug left for derivation', async () => {
    await expect(actions.createEventAction(VALUES)).rejects.toBeInstanceOf(RedirectError);

    expect(createEvent).toHaveBeenCalledWith('user-organizer', {
      name: 'Cascadia Systems Conf 2026',
      slug: null,
      timezone: 'America/Los_Angeles',
      startsAt: '2026-09-27T09:00',
      endsAt: '2026-09-27T17:00',
      tagline: '',
      eventType: '',
      websiteUrl: '',
      venueName: '',
    });
  });
});

describe('createEventAction when the create is refused', () => {
  it('carries field-keyed details back so the form can mark the row', async () => {
    createEvent.mockRejectedValue(
      conflict('The URL /cascadia-2026 is already taken', { slug: 'Already in use' }),
    );

    expect(await actions.createEventAction({ ...VALUES, slug: 'cascadia-2026' })).toEqual({
      ok: false,
      message: 'The URL /cascadia-2026 is already taken',
      details: { slug: 'Already in use' },
    });
  });

  it('leaves the current event alone when nothing was created', async () => {
    createEvent.mockRejectedValue(conflict('The URL /forum is already taken', { slug: 'Already in use' }));

    await actions.createEventAction(VALUES);

    expect(cookieSet).not.toHaveBeenCalled();
  });

  it('hides an unexpected failure behind a generic message', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    createEvent.mockRejectedValue(new Error('connection terminated'));

    expect(await actions.createEventAction(VALUES)).toEqual({
      ok: false,
      message: 'Something went wrong. Try again.',
    });
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
