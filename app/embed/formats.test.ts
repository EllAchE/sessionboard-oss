import { describe, expect, it } from 'vitest';
import {
  buildFeedPayload,
  feedSupportsFormat,
  parseEmbedFeedFormat,
  renderFeedJson,
  renderFeedXml,
} from './formats';
import {
  parseEmbedOptions,
  sanitizeEmbedCss,
  type EmbedOptions,
  type PublicBundle,
  type PublicSession,
  type PublicSpeaker,
} from './model';

/**
 * `AD-3` / `EMB-15`. These assert the property the feature exists for: JSON, XML and `.ics` are
 * *renderings of one configuration*, not three routes that happen to return event data. So every
 * test below configures the embed the way an organizer would — through the query string — and then
 * checks that the non-HTML rendering honoured it.
 *
 * The visibility tests are the ones that matter most. `loadPublicBundle` is what enforces
 * published/approved/confirmed, and the risk a new output format introduces is that it reaches
 * around the bundle. Asserting "a draft is absent" against a bundle that never had one would prove
 * nothing, so those tests put unpublished-looking content *in* the input and assert it either never
 * appears or, for the filter, that the filter cannot be used to ask for it.
 */

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
    tags: [{ id: 'tag-1', name: 'Stoicism' }],
    speakers: [
      {
        id: 'speaker-1',
        slug: 'cicero-speaker',
        name: 'Marcus Tullius Cicero',
        jobTitle: 'Consul',
        company: 'Roman Republic',
      },
    ],
    ...overrides,
  };
}

function speaker(overrides: Partial<PublicSpeaker> = {}): PublicSpeaker {
  return {
    id: 'speaker-1',
    slug: 'cicero-speaker',
    name: 'Marcus Tullius Cicero',
    pronouns: null,
    jobTitle: 'Consul',
    company: 'Roman Republic',
    bioHtml: '<p>Roman statesman.</p>',
    bioText: 'Roman statesman.',
    bioExcerpt: 'Roman statesman.',
    headshotUrl: '/embed/orator-2026/headshot/file-1',
    links: [{ label: 'Site', url: 'https://example.test' }],
    sessionIds: ['session-1'],
    ...overrides,
  };
}

function bundle(overrides: Partial<PublicBundle> = {}): PublicBundle {
  return {
    event: EVENT,
    sessions: [session()],
    speakers: [speaker()],
    tracks: [{ id: 'track-1', name: 'Leadership' }],
    rooms: [{ id: 'room-1', name: 'Curia' }],
    sponsors: [],
    ...overrides,
  };
}

function optionsFrom(query: string): EmbedOptions {
  return parseEmbedOptions(
    Object.fromEntries(new URLSearchParams(query)) as Record<string, string>,
  );
}

function payloadFor(query: string, view: Parameters<typeof buildFeedPayload>[1]['view'] = 'sessions', input = bundle()) {
  return buildFeedPayload(input, {
    view,
    options: optionsFrom(query),
    origin: 'https://cicero.test',
    canonicalUrl: `https://cicero.test/embed/orator-2026/${view}`,
    generatedAt: new Date('2026-08-17T00:00:00.000Z'),
  });
}

describe('parseEmbedFeedFormat', () => {
  it('accepts only the three extension-bearing segments', () => {
    expect(parseEmbedFeedFormat('feed.json')).toBe('json');
    expect(parseEmbedFeedFormat('feed.xml')).toBe('xml');
    expect(parseEmbedFeedFormat('feed.ics')).toBe('ics');
    expect(parseEmbedFeedFormat('json')).toBeNull();
    expect(parseEmbedFeedFormat('feed.yaml')).toBeNull();
    expect(parseEmbedFeedFormat('../../etc/passwd')).toBeNull();
  });

  it('offers a calendar only for the views that carry sessions', () => {
    expect(feedSupportsFormat('sessions', 'ics')).toBe(true);
    expect(feedSupportsFormat('speakers', 'ics')).toBe(true);
    expect(feedSupportsFormat('sponsors', 'ics')).toBe(false);
    expect(feedSupportsFormat('exhibitor-map', 'ics')).toBe(false);
    expect(feedSupportsFormat('exhibitor-map', 'json')).toBe(true);
  });
});

describe('the feed is a rendering of the widget configuration', () => {
  it('applies the same track filter the HTML widget would', () => {
    const input = bundle({
      sessions: [session(), session({ id: 'session-2', track: 'Law', title: 'On the laws' })],
    });
    const payload = payloadFor('track=Leadership', 'sessions', input);
    const sessions = payload.sessions as { title: string }[];

    expect(sessions).toHaveLength(1);
    expect(sessions[0].title).toBe('On duties in public life');
  });

  it('applies the limit', () => {
    const input = bundle({
      sessions: [session(), session({ id: 'session-2' }), session({ id: 'session-3' })],
    });
    expect((payloadFor('limit=2', 'sessions', input).sessions as unknown[])).toHaveLength(2);
  });

  it('omits deselected fields rather than nulling them', () => {
    const payload = payloadFor('description=0&room_label=0&track_label=0');
    const [first] = payload.sessions as Record<string, unknown>[];

    expect(first).not.toHaveProperty('description');
    expect(first).not.toHaveProperty('descriptionHtml');
    expect(first).not.toHaveProperty('room');
    expect(first).not.toHaveProperty('track');
    expect(first.title).toBe('On duties in public life');
  });

  it('drops speaker bios and headshots when those fields are off', () => {
    const payload = payloadFor('bio=0&photo=0', 'speakers');
    const [first] = payload.speakers as Record<string, unknown>[];

    expect(first).not.toHaveProperty('bio');
    expect(first).not.toHaveProperty('bioHtml');
    expect(first).not.toHaveProperty('headshotUrl');
    expect(first.name).toBe('Marcus Tullius Cicero');
  });

  it('echoes the applied configuration so a cached copy is self-describing', () => {
    const payload = payloadFor('track=Leadership&limit=5&status=scheduled');
    expect(payload.filters).toMatchObject({
      status: 'scheduled',
      tracks: ['Leadership'],
      limit: 5,
    });
  });

  it('absolutizes asset paths, because the consumer is on another origin', () => {
    const payload = payloadFor('', 'speakers');
    const [first] = payload.speakers as { headshotUrl: string }[];
    expect(first.headshotUrl).toBe('https://cicero.test/embed/orator-2026/headshot/file-1');
  });

  it('carries the canonical calendar identity, not a second one', () => {
    const [first] = payloadFor('').sessions as { calendar: { uid: string; sequence: number } }[];
    expect(first.calendar).toEqual({ uid: '4a1f-canonical@cicero.events', sequence: 3 });
  });

  it('answers the speaker views with speakers and the sponsor view with sponsors', () => {
    expect(payloadFor('', 'gallery')).toHaveProperty('speakers');
    expect(payloadFor('', 'gallery')).not.toHaveProperty('sessions');
    expect(payloadFor('', 'sponsors')).toHaveProperty('sponsors');
  });
});

describe('publication status filter', () => {
  const input = bundle({
    sessions: [session(), session({ id: 'session-2', title: 'Unslotted', startsAt: null, endsAt: null })],
  });

  it('defaults to the full public programme', () => {
    expect((payloadFor('', 'sessions', input).sessions as unknown[])).toHaveLength(2);
  });

  it('narrows to sessions with a confirmed time', () => {
    const sessions = payloadFor('status=scheduled', 'sessions', input).sessions as {
      title: string;
    }[];
    expect(sessions.map((entry) => entry.title)).toEqual(['On duties in public life']);
  });

  it('narrows to sessions still awaiting a time', () => {
    const sessions = payloadFor('status=tba', 'sessions', input).sessions as { title: string }[];
    expect(sessions.map((entry) => entry.title)).toEqual(['Unslotted']);
  });

  /**
   * The leak this guards against: a caller hand-editing the URL to `status=draft` and the filter
   * obligingly widening. There is nothing to widen to — the bundle is published-only — but the
   * parser must also refuse to carry the value, or a future filter implementation could honour it.
   */
  it('falls back to the public programme for a status the public may not ask for', () => {
    for (const smuggled of ['draft', 'cancelled', 'in_review', 'all', '../draft']) {
      const options = optionsFrom(`status=${encodeURIComponent(smuggled)}`);
      expect(options.status).toBe('published');
    }
  });
});

describe('visibility is inherited from the bundle and never re-derived', () => {
  /**
   * The bundle is the whole world these serializers can see. If a draft never enters it, no format
   * can emit one — this asserts the serializers hold no back channel of their own.
   */
  it('emits nothing for content the bundle does not carry', () => {
    const empty = payloadFor('', 'sessions', bundle({ sessions: [], speakers: [] }));
    expect(empty.sessions).toEqual([]);

    const json = renderFeedJson(empty);
    const xml = renderFeedXml(empty);
    for (const body of [json, xml]) {
      expect(body).not.toContain('draft');
      expect(body).not.toContain('in_review');
      expect(body).not.toContain('@');
    }
  });

  it('never emits a reviewer note, decision, or email even when asked for every field', () => {
    const json = renderFeedJson(payloadFor('bio=1&photo=1&description=1', 'sessions'));
    const parsed = JSON.parse(json) as { sessions: Record<string, unknown>[] };
    const keys = new Set(parsed.sessions.flatMap((entry) => Object.keys(entry)));

    for (const forbidden of ['email', 'contentStatus', 'reviewerNotes', 'decision', 'score']) {
      expect(keys.has(forbidden)).toBe(false);
    }
  });
});

describe('XML rendering', () => {
  it('is well-formed, names array entries singularly, and escapes markup', () => {
    const xml = renderFeedXml(payloadFor(''));

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<sessions>');
    expect(xml).toContain('<session>');
    expect(xml).toContain('<tag>Stoicism</tag>');
    expect(xml).toContain('&lt;p&gt;Practical ethics.&lt;/p&gt;');
    // The raw HTML from the description must not survive as markup.
    expect(xml).not.toContain('<p>Practical ethics.</p>');
  });

  it('escapes a title that is trying to close an element', () => {
    const hostile = bundle({ sessions: [session({ title: '</title><script>alert(1)</script>' })] });
    const xml = renderFeedXml(payloadFor('', 'sessions', hostile));

    expect(xml).not.toContain('<script>');
    expect(xml).toContain('&lt;script&gt;');
  });

  it('renders an empty collection as an empty element rather than invalid markup', () => {
    const xml = renderFeedXml(payloadFor('', 'sessions', bundle({ sessions: [] })));
    expect(xml).toContain('<sessions/>');
  });
});

describe('JSON rendering', () => {
  it('parses back to the payload', () => {
    const payload = payloadFor('limit=1');
    expect(JSON.parse(renderFeedJson(payload))).toEqual(JSON.parse(JSON.stringify(payload)));
  });
});

describe('sanitizeEmbedCss', () => {
  it('keeps an ordinary skin', () => {
    expect(sanitizeEmbedCss('.cicero-embed { font-family: Georgia, serif; }')).toBe(
      '.cicero-embed { font-family: Georgia, serif; }',
    );
  });

  it('refuses anything that could close the style element', () => {
    expect(sanitizeEmbedCss('a{}</style><script>alert(1)</script>')).toBeNull();
    expect(sanitizeEmbedCss('a { content: "<b>" }')).toBeNull();
  });

  it('refuses off-origin fetches and legacy script-in-CSS vectors', () => {
    expect(sanitizeEmbedCss('@import url("https://evil.test/x.css");')).toBeNull();
    expect(sanitizeEmbedCss('body { background: url(https://evil.test/pixel.png); }')).toBeNull();
    expect(sanitizeEmbedCss('body { background: URL( /x.png ); }')).toBeNull();
    expect(sanitizeEmbedCss('div { width: expression(alert(1)); }')).toBeNull();
    expect(sanitizeEmbedCss('div { behavior: url(#default#time2); }')).toBeNull();
    expect(sanitizeEmbedCss('div { -moz-binding: x; }')).toBeNull();
  });

  it('refuses an oversized or empty value', () => {
    expect(sanitizeEmbedCss('a{}'.repeat(4000))).toBeNull();
    expect(sanitizeEmbedCss('   ')).toBeNull();
    expect(sanitizeEmbedCss(null)).toBeNull();
  });

  it('round-trips through the option parser', () => {
    expect(optionsFrom('css=' + encodeURIComponent('.x{color:red}')).css).toBe('.x{color:red}');
    expect(optionsFrom('css=' + encodeURIComponent('@import "x";')).css).toBeNull();
  });
});
