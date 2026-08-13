import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ScheduleEntry } from '@/lib/services/schedule';
import type { NamedTrack } from './wire';
import { GroupedView } from './Views';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const tracks: NamedTrack[] = Array.from({ length: 12 }, (_, index) => ({
  id: `track-${index + 1}`,
  name: `Track ${index + 1}`,
  color: null,
}));

const entries: ScheduleEntry[] = tracks.map((track, index) => ({
  id: `session-${index + 1}`,
  ref: index + 1,
  title: `Session ${index + 1}`,
  submissionId: null,
  roomId: 'room-1',
  trackId: track.id,
  formatId: null,
  startsAt: new Date(`2027-04-15T${String(9 + Math.floor(index / 2)).padStart(2, '0')}:00:00.000Z`),
  endsAt: new Date(`2027-04-15T${String(10 + Math.floor(index / 2)).padStart(2, '0')}:00:00.000Z`),
  status: 'published',
  ceuCredits: null,
  clientId: null,
  speakers: [],
}));

describe('GroupedView mobile scaling', () => {
  it('renders a track picker and identifies exactly one active mobile section', () => {
    const html = renderToStaticMarkup(
      <GroupedView
        entries={entries}
        timeZone="UTC"
        labels={{
          rooms: { 'room-1': 'Room 1' },
          tracks: Object.fromEntries(tracks.map((track) => [track.id, track.name])),
        }}
        groupBy="track"
        rooms={[{ id: 'room-1', name: 'Room 1', capacity: null, floor: null }]}
        tracks={tracks}
        conflictsBySessionId={new Map()}
        onOpen={vi.fn()}
      />,
    );

    expect(html).toContain('<select');
    expect(html.match(/<option/g)).toHaveLength(12);
    expect(html.match(/data-mobile-active="true"/g)).toHaveLength(1);
    expect(html.match(/data-mobile-active="false"/g)).toHaveLength(11);
  });
});
