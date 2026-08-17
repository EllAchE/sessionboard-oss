import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { EmbedOptions, PublicBundle, PublicSession } from '../model';
import { ItineraryWidget } from './ItineraryWidget';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const options: EmbedOptions = {
  tracks: [],
  rooms: [],
  formats: [],
  status: 'published',
  showBio: true,
  showPhoto: true,
  showRoom: true,
  showTrack: true,
  showDescription: true,
  columns: 3,
  accent: null,
  css: null,
  theme: 'auto',
  limit: null,
  speaker: null,
  day: null,
  query: '',
};

function session(index: number): PublicSession {
  return {
    id: `session-${index}`,
    ref: index,
    title: `A readable session title ${index}`,
    descriptionHtml: '',
    descriptionText: '',
    descriptionExcerpt: '',
    startsAt: '2027-04-15T13:00:00.000Z',
    endsAt: '2027-04-15T13:30:00.000Z',
    room: `Room ${index}`,
    track: `Track ${index}`,
    trackId: `track-${index}`,
    format: 'Talk',
    ceuCredits: null,
    icsUid: `ics-session-${index}@cicero.events`,
    icsSequence: 0,
    tags: [],
    speakers: [],
  };
}

function bundle(): PublicBundle {
  const sessions = [session(1), session(2)];
  return {
    event: {
      id: 'event-1',
      slug: 'scaling-qa',
      name: 'Scaling QA',
      tagline: null,
      timezone: 'UTC',
      startsOn: '2027-04-15',
      endsOn: '2027-04-15',
      websiteUrl: null,
      venueName: null,
    },
    sessions,
    speakers: [],
    tracks: sessions.map((entry, index) => ({ id: `track-${index + 1}`, name: entry.track! })),
    rooms: sessions.map((entry, index) => ({ id: `room-${index + 1}`, name: entry.room! })),
  };
}

describe('ItineraryWidget server rendering', () => {
  /*
    The personal schedule is `localStorage`, so it is always empty on the server. Opening on it there
    would serve an empty page to every share link, crawler and no-JS visit; the switch to the
    schedule belongs after hydration, when the store has actually been read.
  */
  it('ships the programme in the HTML rather than an empty personal schedule', () => {
    const html = renderToStaticMarkup(
      <ItineraryWidget bundle={bundle()} options={options} speakerBase="/speakers" />,
    );

    expect(html).toContain('A readable session title 1');
    expect(html).toContain('A readable session title 2');
    expect(html).not.toContain('Your schedule is empty');
  });

  it('leads with the personal schedule tab and counts what is in it', () => {
    const html = renderToStaticMarkup(
      <ItineraryWidget bundle={bundle()} options={options} speakerBase="/speakers" />,
    );

    const mineTab = html.indexOf('★ My schedule (0)');
    expect(mineTab).toBeGreaterThan(-1);
    // The schedule tab comes before the day tabs, not after them.
    expect(mineTab).toBeLessThan(html.indexOf('Apr'));
  });

  it('names each star after its session and offers it unpressed to a fresh visitor', () => {
    const html = renderToStaticMarkup(
      <ItineraryWidget bundle={bundle()} options={options} speakerBase="/speakers" />,
    );

    expect(html).toContain('aria-label="Add A readable session title 1 to my schedule"');
    expect(html).toContain('aria-pressed="false"');
  });

  it('honours an explicit day from the embed options', () => {
    const html = renderToStaticMarkup(
      <ItineraryWidget
        bundle={bundle()}
        options={{ ...options, day: 'mine' }}
        speakerBase="/speakers"
      />,
    );

    expect(html).toContain('Your schedule is empty');
  });
});
