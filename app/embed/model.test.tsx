import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  applyFilters,
  EMPTY_SESSION_FACETS,
  facetValues,
  parseEmbedOptions,
  sessionMatches,
  sessionMatchesFacets,
  speakerMatches,
  speakerSlug,
  type PublicSession,
  type PublicSpeaker,
} from './model';
import { hasUsableSpeakerPhoto, SpeakerProfile, SpeakerRoster } from './views/parts';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const speaker: PublicSpeaker = {
  id: 'speaker-12345678',
  slug: 'cicero-speaker',
  name: 'Marcus Tullius Cicero',
  pronouns: null,
  jobTitle: 'Consul',
  company: 'Roman Republic',
  bioHtml: '<p>Roman statesman and philosopher.</p>',
  bioText: 'Roman statesman and philosopher.',
  bioExcerpt: 'Roman statesman and philosopher.',
  headshotUrl: null,
  links: [],
  sessionIds: ['session-1'],
};

const session: PublicSession = {
  id: 'session-1',
  ref: 12,
  title: 'On duties in public life',
  descriptionHtml: '<p>Practical ethics for civic leaders.</p>',
  descriptionText: 'Practical ethics for civic leaders.',
  descriptionExcerpt: 'Practical ethics for civic leaders.',
  startsAt: '2026-09-08T14:00:00.000Z',
  endsAt: '2026-09-08T15:00:00.000Z',
  room: 'Forum',
  track: 'Leadership',
  trackId: 'track-1',
  format: 'Talk',
  ceuCredits: null,
  icsUid: 'ics-session-1@cicero.events',
  icsSequence: 0,
  tags: [{ id: 'tag-1', name: 'Stoicism' }],
  speakers: [
    {
      id: speaker.id,
      slug: speakerSlug(speaker.id, speaker.name),
      name: speaker.name,
      jobTitle: speaker.jobTitle,
      company: speaker.company,
    },
  ],
};

describe('public programme discovery', () => {
  it('searches talks through topic and speaker relations', () => {
    expect(sessionMatches(session, 'Stoicism')).toBe(true);
    expect(sessionMatches(session, 'Roman Republic')).toBe(true);
    expect(sessionMatches(session, 'civic leaders')).toBe(true);
  });

  it('searches speakers through profiles and their related talks', () => {
    expect(speakerMatches(speaker, 'philosopher', [session])).toBe(true);
    expect(speakerMatches(speaker, 'public life', [session])).toBe(true);
    expect(speakerMatches(speaker, 'Stoicism', [session])).toBe(true);
  });

  it('filters talks by event-local day and topic', () => {
    const facets = {
      ...EMPTY_SESSION_FACETS,
      days: ['2026-09-08'],
      topics: ['Stoicism'],
    };

    expect(sessionMatchesFacets(session, facets, 'UTC')).toBe(true);
    expect(sessionMatchesFacets(session, { ...facets, days: ['2026-09-09'] }, 'UTC')).toBe(false);
    expect(sessionMatchesFacets(session, { ...facets, topics: ['Rhetoric'] }, 'UTC')).toBe(false);
  });

  it('counts each topic once per talk', () => {
    const repeated = {
      ...session,
      id: 'session-2',
      tags: [
        { id: 'tag-1', name: 'Stoicism' },
        { id: 'tag-duplicate', name: 'Stoicism' },
      ],
    };

    expect(facetValues([session, repeated], (entry) => entry.tags.map((tag) => tag.name))).toEqual([
      { value: 'Stoicism', count: 2 },
    ]);
  });
});

describe('embed query boundaries', () => {
  it('accepts bounded repeated list filters without collapsing them', () => {
    expect(parseEmbedOptions({ track: ['Platform', 'Design'] }).tracks).toEqual([
      'Platform',
      'Design',
    ]);
  });

  it('defaults ambiguous scalars and oversized values', () => {
    const options = parseEmbedOptions({
      q: ['first', 'second'],
      limit: '999999',
      room: 'x'.repeat(121),
      day: '2026-02-30',
    });
    expect(options.query).toBe('');
    expect(options.limit).toBeNull();
    expect(options.rooms).toEqual([]);
    expect(options.day).toBeNull();
  });

  it('bounds comma-separated filter cardinality', () => {
    const track = Array.from({ length: 21 }, (_, index) => `track-${index}`).join(',');
    expect(parseEmbedOptions({ track }).tracks).toEqual([]);
  });

  it('keeps confirmed directory profiles without sessions until a session filter is requested', () => {
    const unplaced: PublicSpeaker = {
      ...speaker,
      id: 'speaker-unplaced',
      slug: 'aemilia-fausta',
      name: 'Aemilia Fausta',
      sessionIds: [],
    };
    const bundle = {
      event: {
        id: 'event-1',
        slug: 'republic',
        name: 'The Republic',
        tagline: null,
        timezone: 'UTC',
        startsOn: null,
        endsOn: null,
        websiteUrl: null,
        venueName: null,
      },
      sessions: [session],
      speakers: [speaker, unplaced],
      tracks: [{ id: 'track-1', name: 'Leadership' }],
      rooms: [{ id: 'room-1', name: 'Forum' }],
    };

    expect(applyFilters(bundle, parseEmbedOptions({})).speakers.map((entry) => entry.id)).toEqual([
      speaker.id,
      unplaced.id,
    ]);
    expect(
      applyFilters(bundle, parseEmbedOptions({ track: 'Leadership' })).speakers.map(
        (entry) => entry.id,
      ),
    ).toEqual([speaker.id]);
  });
});

describe('public programme relation links', () => {
  it('falls back when a headshot URL has failed to load', () => {
    expect(hasUsableSpeakerPhoto(null, null)).toBe(false);
    expect(hasUsableSpeakerPhoto('/embed/republic/headshot/file-1', null)).toBe(true);
    expect(
      hasUsableSpeakerPhoto(
        '/embed/republic/headshot/file-1',
        '/embed/republic/headshot/file-1',
      ),
    ).toBe(false);
  });

  it('keeps identical display names independently addressable by id', () => {
    expect(speakerSlug('aaaaaaaa-1111', 'Alex Kim')).toBe('alex-kim-aaaaaaaa');
    expect(speakerSlug('bbbbbbbb-2222', 'Alex Kim')).toBe('alex-kim-bbbbbbbb');
  });

  it('links a talk speaker to the standalone profile', () => {
    const html = renderToStaticMarkup(
      <SpeakerRoster session={session} speakerBase="/republic/speakers" />,
    );

    expect(html).toContain(`href="/republic/speakers/${session.speakers[0].slug}"`);
    expect(html).toContain(speaker.name);
    expect(html).toContain('dir="auto"');
  });

  it('links a profile session back to the talks browser', () => {
    const html = renderToStaticMarkup(
      <SpeakerProfile
        speaker={speaker}
        sessions={[session]}
        timezone="UTC"
        sessionBase="/republic/sessions"
      />,
    );

    expect(html).toContain('href="/republic/sessions#session-12"');
    expect(html).toContain(session.title);
  });
});
