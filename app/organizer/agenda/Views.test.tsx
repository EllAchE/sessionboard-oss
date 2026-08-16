import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { detectConflicts, type ScheduleEntry } from '@/lib/services/schedule';
import type { NamedTrack } from './wire';
import { ConflictsView, GroupedView } from './Views';

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

/**
 * `AR-35`. The rehearsal script's step 6 — "force a room clash and a speaker double-booking;
 * confirm both surface" — was previously unperformable: nothing could persist a conflicting agenda,
 * so this view could only ever render its empty state. These assertions are that step, in code.
 */
describe('ConflictsView (A-2, AR-35)', () => {
  const window = {
    startsAt: new Date('2027-04-15T09:00:00.000Z'),
    endsAt: new Date('2027-04-15T10:00:00.000Z'),
  };

  const clashing: ScheduleEntry[] = [
    {
      id: 'session-a',
      ref: 1,
      title: 'On Duties',
      submissionId: null,
      roomId: 'room-1',
      trackId: 'track-1',
      formatId: null,
      status: 'published',
      ceuCredits: null,
      clientId: null,
      speakers: [{ participantId: 'p-cicero', name: 'Cicero' }],
      ...window,
    },
    {
      id: 'session-b',
      ref: 2,
      title: 'On the Republic',
      submissionId: null,
      roomId: 'room-2',
      trackId: 'track-1',
      formatId: null,
      status: 'published',
      ceuCredits: null,
      clientId: null,
      speakers: [{ participantId: 'p-cicero', name: 'Cicero' }],
      ...window,
    },
  ];

  const render = (policy: 'warn' | 'block') =>
    renderToStaticMarkup(
      <ConflictsView
        conflicts={detectConflicts(clashing, { tracks: { 'track-1': 'Rhetoric' } })}
        entries={clashing}
        timeZone="UTC"
        onOpen={vi.fn()}
        policy={policy}
        canManage
        onPolicyChange={vi.fn()}
        onUnschedule={vi.fn()}
      />,
    );

  it('names the double-booked speaker and both sessions', () => {
    const html = render('warn');

    expect(html).toContain('Cicero is scheduled in On Duties and On the Republic at the same time');
    expect(html).toContain('Speaker double-booking');
  });

  it('offers a one-click resolve for each side of the clash', () => {
    const html = render('warn');

    expect(html).toContain('Unschedule On Duties');
    expect(html).toContain('Unschedule On the Republic');
  });

  it('renders the organizer switch, reflecting the stored policy', () => {
    expect(render('warn')).toContain('aria-checked="false"');
    expect(render('block')).toContain('aria-checked="true"');
    expect(render('warn')).toContain('Block clashes on save');
  });

  it('hides the resolve action from someone who cannot manage the agenda', () => {
    const html = renderToStaticMarkup(
      <ConflictsView
        conflicts={detectConflicts(clashing)}
        entries={clashing}
        timeZone="UTC"
        onOpen={vi.fn()}
        policy="warn"
        canManage={false}
        onPolicyChange={vi.fn()}
        onUnschedule={vi.fn()}
      />,
    );

    expect(html).not.toContain('Unschedule');
    expect(html).toContain('disabled');
  });
});
