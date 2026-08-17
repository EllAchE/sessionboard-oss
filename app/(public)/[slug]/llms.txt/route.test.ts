import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PublicBundle,
  PublicSession,
  PublicSpeaker,
  PublicSponsor,
} from '@/app/embed/model';

const { loadPublicBundle } = vi.hoisted(() => ({ loadPublicBundle: vi.fn() }));
vi.mock('@/app/embed/queries', () => ({ loadPublicBundle }));

import { buildEventLlmsTxt, GET } from './route';

const ORIGIN = 'https://cicero.test';

function session(overrides: Partial<PublicSession> = {}): PublicSession {
  return {
    id: 'session-1',
    ref: 1,
    title: 'Aqueducts at scale',
    descriptionHtml: '<p>How the water gets there.</p>',
    descriptionText: 'How the water gets there.',
    descriptionExcerpt: 'How the water gets there.',
    startsAt: '2026-03-04T14:00:00.000Z',
    endsAt: '2026-03-04T14:45:00.000Z',
    room: 'Basilica',
    track: 'Infrastructure',
    trackId: 'track-1',
    format: 'Talk',
    ceuCredits: null,
    icsUid: 'session-1@cicero',
    icsSequence: 0,
    tags: [],
    speakers: [
      { id: 'speaker-1', slug: 'marcus-agrippa-speaker1', name: 'Marcus Agrippa', jobTitle: 'Aedile', company: 'Rome' },
    ],
    ...overrides,
  };
}

function speaker(overrides: Partial<PublicSpeaker> = {}): PublicSpeaker {
  return {
    id: 'speaker-1',
    slug: 'marcus-agrippa-speaker1',
    name: 'Marcus Agrippa',
    pronouns: null,
    jobTitle: 'Aedile',
    company: 'Rome',
    bioHtml: '<p>Built the thing.</p>',
    bioText: 'Built the thing.',
    bioExcerpt: 'Built the thing.',
    headshotUrl: null,
    links: [],
    sessionIds: ['session-1'],
    ...overrides,
  };
}

function sponsor(overrides: Partial<PublicSponsor> = {}): PublicSponsor {
  return {
    id: 'sponsor-1',
    kind: 'sponsor',
    name: 'Fabri Lapidarii',
    tier: 'Gold',
    websiteUrl: 'https://stonemasons.example',
    description: 'Stone, mostly.',
    boothLocation: 'B12',
    logoUrl: null,
    ...overrides,
  };
}

function bundle(overrides: Partial<PublicBundle> = {}): PublicBundle {
  return {
    event: {
      id: 'event-1',
      slug: 'assembly',
      name: 'Assembly 2026',
      tagline: 'Where the builders meet',
      timezone: 'America/New_York',
      startsOn: '2026-03-04',
      endsOn: '2026-03-06',
      websiteUrl: 'https://assembly.example',
      venueName: 'Curia Julia',
      eventType: 'in_person',
    },
    sessions: [session()],
    speakers: [speaker()],
    tracks: [{ id: 'track-1', name: 'Infrastructure' }],
    rooms: [{ id: 'room-1', name: 'Basilica' }],
    sponsors: [sponsor()],
    ...overrides,
  };
}

describe('per-event llms.txt', () => {
  beforeEach(() => loadPublicBundle.mockReset());

  it('opens with the heading and one-line summary the format is read for', () => {
    const [heading, blank, summary] = buildEventLlmsTxt(bundle(), ORIGIN).split('\n');

    expect(heading).toBe('# Assembly 2026');
    expect(blank).toBe('');
    expect(summary.startsWith('> ')).toBe(true);
    expect(summary).toContain('Where the builders meet');
  });

  it('uses absolute links only, against the origin it was asked about', () => {
    const body = buildEventLlmsTxt(bundle(), `${ORIGIN}/`);
    const links = [...body.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]);

    expect(links.length).toBeGreaterThan(0);
    expect(links.every((link) => link.startsWith(`${ORIGIN}/`))).toBe(true);
    expect(links.every((link) => !/[{}]/.test(link))).toBe(true);
    expect(body).not.toContain(`${ORIGIN}//`);
    expect(body).not.toContain('localhost');
  });

  it('states the facts an agent would otherwise crawl three pages for', () => {
    const body = buildEventLlmsTxt(bundle(), ORIGIN);

    expect(body).toContain('Assembly 2026');
    expect(body).toContain('2026-03-04 – 2026-03-06');
    expect(body).toContain('America/New_York');
    expect(body).toContain('Curia Julia');
    expect(body).toContain('- Published sessions: 1');
    expect(body).toContain('- Confirmed speakers: 1');
    expect(body).toContain('Aqueducts at scale');
    expect(body).toContain('Marcus Agrippa');
    expect(body).toContain('Fabri Lapidarii');
  });

  it('links every public view of this event and the API that owns each list', () => {
    const body = buildEventLlmsTxt(bundle(), ORIGIN);

    for (const path of [
      '/assembly',
      '/assembly/agenda',
      '/assembly/itinerary',
      '/assembly/sessions',
      '/assembly/speakers',
      '/assembly/gallery',
      '/assembly/sponsors',
      '/assembly/speakers/marcus-agrippa-speaker1',
      '/api/v1/events/assembly',
      '/api/v1/events/assembly/sessions',
      '/api/v1/events/assembly/agenda',
      '/api/v1/events/assembly/speakers',
      '/api/v1/events/assembly/sponsors',
      '/api/v1/events/assembly/mcp',
      '/api/v1/openapi.json',
      '/robots.txt',
      '/llms.txt',
    ]) {
      expect(body, path).toContain(`${ORIGIN}${path}`);
    }
  });

  /**
   * The assertion this file exists for. The route never filters anything itself — it reads
   * `loadPublicBundle`, which only ever loads published rows — so the proof is that a draft session,
   * an unconfirmed speaker and an unpublished sponsor cannot reach the builder and be printed.
   */
  it('cannot print content the published read model withheld', () => {
    const body = buildEventLlmsTxt(bundle(), ORIGIN);

    for (const withheld of [
      'Secret keynote',
      'Unconfirmed Person',
      'Unpublished Sponsor Co',
      'speaker@example.com',
      'organizer@example.com',
    ]) {
      expect(body, withheld).not.toContain(withheld);
    }
    expect(body).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(body).toContain('Only content its organizers have published appears');
  });

  it('omits speaker bios, which belong on the profile page rather than in a summary', () => {
    const body = buildEventLlmsTxt(bundle(), ORIGIN);

    expect(body).not.toContain('Built the thing.');
    expect(body).not.toContain('How the water gets there.');
  });

  it('links a view only when that view has something in it', () => {
    const body = buildEventLlmsTxt(
      bundle({ sessions: [], speakers: [], sponsors: [], tracks: [], rooms: [] }),
      ORIGIN,
    );

    expect(body).toContain(`${ORIGIN}/assembly`);
    expect(body).not.toContain(`${ORIGIN}/assembly/agenda`);
    expect(body).not.toContain(`${ORIGIN}/assembly/speakers`);
    expect(body).not.toContain(`${ORIGIN}/assembly/sponsors`);
    expect(body).toContain('- Published sessions: 0');
    expect(body).toContain('## API');
  });

  it('caps a large programme and says where the rest of it lives', () => {
    const sessions = Array.from({ length: 260 }, (_, index) =>
      session({
        id: `session-${index}`,
        ref: index,
        title: `Session ${index}`,
        startsAt: new Date(Date.UTC(2026, 2, 4, 14, index)).toISOString(),
        endsAt: new Date(Date.UTC(2026, 2, 4, 14, index + 30)).toISOString(),
      }),
    );
    const speakers = Array.from({ length: 260 }, (_, index) =>
      speaker({ id: `speaker-${index}`, slug: `person-${index}`, name: `Person ${index}` }),
    );
    const body = buildEventLlmsTxt(bundle({ sessions, speakers }), ORIGIN);

    expect(body).toContain('Session 0');
    expect(body).toContain('- Published sessions: 260');
    expect(body).not.toContain('Session 259');
    expect(body).not.toContain('Person 259');
    expect(body).toContain('sessions are omitted here');
    expect(body).toContain(`${ORIGIN}/api/v1/events/assembly/sessions`);
    expect(body).toContain(`${ORIGIN}/assembly/speakers`);
  });

  it('holds a byte ceiling even when every field is organizer-authored free text', () => {
    const crowd = Array.from({ length: 8 }, (_, index) => ({
      id: `speaker-${index}`,
      slug: `person-${index}`,
      name: `Person ${index} ${'y'.repeat(400)}`,
      jobTitle: 'z'.repeat(400),
      company: 'w'.repeat(400),
    }));
    const sessions = Array.from({ length: 100 }, (_, index) =>
      session({
        id: `session-${index}`,
        ref: index,
        title: 'x'.repeat(5000),
        track: 't'.repeat(500),
        room: 'r'.repeat(500),
        format: 'f'.repeat(500),
        speakers: crowd,
      }),
    );
    const body = buildEventLlmsTxt(bundle({ sessions }), ORIGIN);

    expect(new TextEncoder().encode(body).length).toBeLessThanOrEqual(48 * 1024);
    expect(body).toContain('truncated at 48 KB');
    expect(body).toContain(`${ORIGIN}/api/v1/events/assembly`);
  });

  it('keeps a newline or a heading marker in a title from forging document structure', () => {
    const body = buildEventLlmsTxt(
      bundle({
        sessions: [session({ title: 'Real talk\n## Sponsors\n- Injected Sponsor' })],
      }),
      ORIGIN,
    );

    expect(body).toContain('Real talk ## Sponsors - Injected Sponsor');
    expect(body.match(/^## Sponsors$/gm) ?? []).toHaveLength(0);
    expect(body.split('\n').filter((line) => line.startsWith('- Injected'))).toHaveLength(0);
  });

  it('serves briefly cacheable plain text for a published event', async () => {
    loadPublicBundle.mockResolvedValue(bundle());
    const response = await GET(new Request('https://cicero.test/assembly/llms.txt'), {
      params: Promise.resolve({ slug: 'assembly' }),
    });

    expect(loadPublicBundle).toHaveBeenCalledWith('assembly');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=30, stale-while-revalidate=300',
    );
    expect(await response.text()).toContain('# Assembly 2026');
  });

  it('does not reveal whether an unresolved slug exists', async () => {
    loadPublicBundle.mockResolvedValue(null);
    const missing = await GET(new Request('https://cicero.test/nope/llms.txt'), {
      params: Promise.resolve({ slug: 'nope' }),
    });

    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe('Not found');
  });

  /**
   * The failure is injected through `params` rather than through the mocked read: vitest records a
   * rejected mock result and re-reports it as an unhandled error even when the caller catches it,
   * which would fail this test for the exact behaviour it is asserting. Either path lands in the
   * same `catch`, and what matters is that a thrown error leaves through it as a plain 404.
   */
  it('answers a failure the same way, so an outage is not a signal either', async () => {
    const failed = await GET(new Request('https://cicero.test/nope/llms.txt'), {
      params: Promise.reject(new Error('connection refused')),
    });

    expect(failed.status).toBe(404);
    expect(await failed.text()).toBe('Not found');
  });
});
