import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicBundle, PublicSession } from '../../../model';

const { loadPublicBundle, getPublicExhibitorMap } = vi.hoisted(() => ({
  loadPublicBundle: vi.fn(),
  getPublicExhibitorMap: vi.fn(),
}));

/**
 * `loadPublicBundle` is mocked, not stubbed away: the point of these tests is that the route is a
 * pure rendering of whatever that one function returns. Every published/approved/confirmed decision
 * lives inside it (`app/embed/queries.ts`), so a route that only ever reads its result cannot leak
 * — and the test that proves that is the one below which hands the mock a bundle and asserts the
 * response contains nothing that was not in it.
 */
vi.mock('../../../queries', async () => {
  const model = await vi.importActual<typeof import('../../../model')>('../../../model');
  return { ...model, loadPublicBundle };
});
vi.mock('@/lib/services/exhibitor-map', () => ({ getPublicExhibitorMap }));

import { GET } from './route';

const EVENT = {
  id: 'event-1',
  slug: 'orator-2026',
  name: 'Orator 2026',
  tagline: 'Rhetoric for the republic',
  timezone: 'UTC',
  startsOn: '2026-09-08',
  endsOn: '2026-09-09',
  websiteUrl: 'https://cicero.events/e/orator-2026',
  venueName: 'The Forum',
};

function session(overrides: Partial<PublicSession> = {}): PublicSession {
  return {
    id: 'session-1',
    ref: 12,
    title: 'On duties in public life',
    descriptionHtml: '<p>Practical ethics.</p>',
    descriptionText: 'Practical ethics.',
    descriptionExcerpt: 'Practical ethics.',
    startsAt: '2026-09-08T14:00:00.000Z',
    endsAt: '2026-09-08T15:00:00.000Z',
    room: 'Curia',
    track: 'Leadership',
    trackId: 'track-1',
    format: 'Talk',
    ceuCredits: null,
    icsUid: '4a1f-canonical@cicero.events',
    icsSequence: 3,
    tags: [],
    speakers: [],
    ...overrides,
  };
}

function bundle(overrides: Partial<PublicBundle> = {}): PublicBundle {
  return {
    event: EVENT,
    sessions: [session()],
    speakers: [],
    tracks: [{ id: 'track-1', name: 'Leadership' }],
    rooms: [{ id: 'room-1', name: 'Curia' }],
    sponsors: [],
    ...overrides,
  };
}

function request(view: string, format: string, query = '') {
  return GET(new Request(`https://cicero.test/embed/orator-2026/${view}/${format}${query}`), {
    params: Promise.resolve({ slug: 'orator-2026', view, format }),
  });
}

describe('embed feed route', () => {
  beforeEach(() => {
    loadPublicBundle.mockReset();
    getPublicExhibitorMap.mockReset();
    loadPublicBundle.mockResolvedValue(bundle());
  });

  it('serves JSON with a cross-origin-readable, briefly cached response', async () => {
    const response = await request('sessions', 'feed.json');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('cache-control')).toContain('max-age=300');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');

    const body = (await response.json()) as { view: string; sessions: { title: string }[] };
    expect(body.view).toBe('sessions');
    expect(body.sessions.map((entry) => entry.title)).toEqual(['On duties in public life']);
  });

  it('serves XML', async () => {
    const response = await request('sessions', 'feed.xml');

    expect(response.headers.get('content-type')).toBe('application/xml; charset=utf-8');
    const body = await response.text();
    expect(body.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(body).toContain('<title>On duties in public life</title>');
  });

  it('serves a subscribable calendar rather than a one-shot download', async () => {
    const response = await request('sessions', 'feed.ics');
    const body = await response.text();

    expect(response.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
    /* `inline`, not `attachment` — an attachment is a download, not a subscription. */
    expect(response.headers.get('content-disposition')).toBe(
      'inline; filename="orator-2026-sessions.ics"',
    );
    expect(response.headers.get('cache-control')).toContain('max-age=300');

    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('METHOD:PUBLISH');
    /* Both spellings of the refresh hint, because clients honour one or the other. */
    expect(body).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT60M');
    expect(body).toContain('X-PUBLISHED-TTL:PT60M');
    expect(body).toContain('X-WR-CALNAME:Orator 2026 · Sessions list');
    expect(body.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('keeps the canonical UID and SEQUENCE so a subscriber is not shown a duplicate', async () => {
    const body = await (await request('sessions', 'feed.ics')).text();

    expect(body).toContain('UID:4a1f-canonical@cicero.events');
    expect(body).toContain('SEQUENCE:3');
    expect(body).not.toContain('session-1@');
  });

  it('gives the same URL the same UIDs on a later fetch, which is what makes it subscribable', async () => {
    const first = await (await request('sessions', 'feed.ics')).text();
    const second = await (await request('sessions', 'feed.ics')).text();

    const uids = (body: string) => body.match(/UID:[^\r\n]+/g);
    expect(uids(first)).toEqual(uids(second));
  });

  it('carries the widget configuration into every format alike', async () => {
    loadPublicBundle.mockResolvedValue(
      bundle({
        sessions: [
          session(),
          session({ id: 'session-2', title: 'On the laws', track: 'Law', icsUid: 'b77c@x' }),
        ],
      }),
    );

    const json = (await (await request('sessions', 'feed.json', '?track=Law')).json()) as {
      sessions: { title: string }[];
    };
    const xml = await (await request('sessions', 'feed.xml', '?track=Law')).text();
    const ics = await (await request('sessions', 'feed.ics', '?track=Law')).text();

    expect(json.sessions.map((entry) => entry.title)).toEqual(['On the laws']);
    expect(xml).toContain('On the laws');
    expect(xml).not.toContain('On duties in public life');
    expect(ics).toContain('SUMMARY:On the laws');
    expect(ics).not.toContain('SUMMARY:On duties in public life');
  });

  it('honours the field selection in the calendar too', async () => {
    const withFields = await (await request('sessions', 'feed.ics')).text();
    expect(withFields).toContain('DESCRIPTION:Practical ethics.');
    expect(withFields).toContain('LOCATION:Curia');

    const without = await (
      await request('sessions', 'feed.ics', '?description=0&room_label=0')
    ).text();
    expect(without).not.toContain('DESCRIPTION:Practical ethics.');
    expect(without).not.toContain('Curia');
  });

  it('honours the publication-status filter in the calendar', async () => {
    loadPublicBundle.mockResolvedValue(
      bundle({
        sessions: [session(), session({ id: 'session-2', title: 'Unslotted', startsAt: null })],
      }),
    );

    const scheduled = await (await request('sessions', 'feed.ics', '?status=scheduled')).text();
    expect(scheduled).toContain('SUMMARY:On duties in public life');
    expect(scheduled).not.toContain('Unslotted');
  });

  it('omits undated sessions from the calendar instead of inventing a slot', async () => {
    loadPublicBundle.mockResolvedValue(
      bundle({ sessions: [session({ startsAt: null, endsAt: null })] }),
    );

    const body = await (await request('sessions', 'feed.ics')).text();
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).not.toContain('BEGIN:VEVENT');
  });

  // -------------------------------------------------------------------------
  // Visibility
  // -------------------------------------------------------------------------

  it('reads the public bundle and nothing else, for every format', async () => {
    for (const format of ['feed.json', 'feed.xml', 'feed.ics']) {
      loadPublicBundle.mockClear();
      await request('sessions', format);
      expect(loadPublicBundle).toHaveBeenCalledTimes(1);
      expect(loadPublicBundle).toHaveBeenCalledWith('orator-2026');
    }
  });

  /**
   * The regression this exists to catch: a future edit that reaches past `loadPublicBundle` for a
   * field, and picks up a draft on the way. If the bundle is empty every format must be empty, no
   * matter what the caller asks for.
   */
  it('emits no programme content when the public bundle holds none', async () => {
    loadPublicBundle.mockResolvedValue(bundle({ sessions: [], speakers: [], sponsors: [] }));

    for (const [format, forbidden] of [
      ['feed.json', '"sessions": []'],
      ['feed.xml', '<sessions/>'],
    ] as const) {
      const body = await (await request('sessions', format, '?status=published&limit=200')).text();
      expect(body).toContain(forbidden);
      expect(body).not.toContain('On duties in public life');
    }

    const ics = await (await request('sessions', 'feed.ics')).text();
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('cannot be talked into a non-public status through the URL', async () => {
    loadPublicBundle.mockResolvedValue(bundle());

    for (const smuggled of ['draft', 'cancelled', 'in_review']) {
      const body = (await (
        await request('sessions', 'feed.json', `?status=${smuggled}`)
      ).json()) as { filters: { status: string }; sessions: unknown[] };

      expect(body.filters.status).toBe('published');
      expect(body.sessions).toHaveLength(1);
    }
  });

  it('404s for an unknown event without saying whether it exists', async () => {
    loadPublicBundle.mockResolvedValue(null);
    const response = await request('sessions', 'feed.json');

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Not found');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  // -------------------------------------------------------------------------
  // Routing
  // -------------------------------------------------------------------------

  it('404s for an unknown widget or an unknown extension', async () => {
    expect((await request('nonsense', 'feed.json')).status).toBe(404);
    expect((await request('sessions', 'feed.yaml')).status).toBe(404);
    expect((await request('sessions', 'json')).status).toBe(404);
  });

  it('404s for a calendar of something that has no sessions', async () => {
    expect((await request('sponsors', 'feed.ics')).status).toBe(404);
    expect((await request('exhibitor-map', 'feed.ics')).status).toBe(404);
  });

  it('answers every widget type in JSON', async () => {
    getPublicExhibitorMap.mockResolvedValue({
      eventId: 'event-1',
      eventName: 'Orator 2026',
      eventSlug: 'orator-2026',
      file: { filename: 'forum.pdf' },
      fileUrl: '/embed/orator-2026/exhibitor-map/file',
    });

    for (const view of [
      'agenda',
      'itinerary',
      'sessions',
      'speakers',
      'gallery',
      'sponsors',
      'exhibitor-map',
    ]) {
      const response = await request(view, 'feed.json');
      expect(response.status, view).toBe(200);
      expect(((await response.json()) as { view: string }).view, view).toBe(view);
    }
  });

  it('reports the exhibitor map as an absolute URL a foreign site can fetch', async () => {
    getPublicExhibitorMap.mockResolvedValue({
      eventId: 'event-1',
      eventName: 'Orator 2026',
      eventSlug: 'orator-2026',
      file: { filename: 'forum.pdf' },
      fileUrl: '/embed/orator-2026/exhibitor-map/file',
    });

    const body = (await (await request('exhibitor-map', 'feed.json')).json()) as {
      map: { url: string; filename: string };
    };
    expect(body.map).toEqual({
      filename: 'forum.pdf',
      url: 'https://cicero.test/embed/orator-2026/exhibitor-map/file',
    });
  });
});
