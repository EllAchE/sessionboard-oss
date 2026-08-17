import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { EmbedOptions, PublicBundle, PublicSession } from '../model';
import { AgendaWidget } from './AgendaWidget';

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

function bundle(roomCount: number): PublicBundle {
  const sessions = Array.from({ length: roomCount }, (_, index) => session(index + 1));
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

describe('AgendaWidget scaling affordances', () => {
  it('labels a large schedule as a keyboard-scrollable region and explains both axes', () => {
    const html = renderToStaticMarkup(
      <AgendaWidget bundle={bundle(8)} options={options} speakerBase="/speakers" />,
    );

    expect(html).toContain('role="region"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('Scroll across and down to explore all 8 rooms');
    expect(html).toContain('aria-describedby="agenda-scroll-hint-2027-04-15"');
  });

  it('marks short cards for compact rendering while retaining a complete accessible name', () => {
    const html = renderToStaticMarkup(
      <AgendaWidget bundle={bundle(1)} options={options} speakerBase="/speakers" />,
    );

    expect(html).toContain('data-compact="true"');
    expect(html).toContain(
      'aria-label="A readable session title 1, 1:00 PM – 1:30 PM, Room 1, Track 1 track"',
    );
  });

  it('opens the gutter an hour before the first session and leaves the header row clear', () => {
    const html = renderToStaticMarkup(
      <AgendaWidget bundle={bundle(1)} options={options} speakerBase="/speakers" />,
    );

    // The only session starts at 13:00 UTC, so the day is drawn from 12:00 rather than flush to it.
    expect(html).toContain('>12:00 PM<');
    // Row 1 is the sticky room header and row 2 is the gap under it, so the day opens on row 3.
    expect(html).toContain('grid-row:3 / span 2');
    // 13:00 is four quarter-hour rows past the 12:00 opening.
    expect(html).toContain('grid-row:7 / 9');
    // A half hour of tail keeps the last block off the bottom edge.
    expect(html).toContain('>2:00 PM<');
  });
});
