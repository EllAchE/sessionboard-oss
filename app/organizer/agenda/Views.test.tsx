import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  detectConflicts,
  type ScheduleEntry,
  type SpeakerUnavailability,
} from '@/lib/services/schedule';
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

/**
 * `AD-2`. The point of the kind is that an organizer sees it *where they already look*, so this
 * asserts it renders through the same rail, with the same resolve action, as the three that came
 * before it — not in a panel of its own that has to be found.
 */
describe('ConflictsView with a speaker-declared window', () => {
  const talk: ScheduleEntry = {
    id: 'session-1',
    ref: 1,
    title: 'On Duties',
    submissionId: null,
    roomId: 'room-1',
    trackId: null,
    formatId: null,
    startsAt: new Date('2026-10-12T16:00:00Z'),
    endsAt: new Date('2026-10-12T17:00:00Z'),
    status: 'draft',
    ceuCredits: null,
    clientId: null,
    speakers: [{ participantId: 'p-cicero', name: 'Cicero' }],
  };

  const declared: SpeakerUnavailability[] = [
    {
      participantId: 'p-cicero',
      startsAt: new Date('2026-10-12T15:00:00Z'),
      endsAt: new Date('2026-10-12T20:00:00Z'),
      timezone: 'Europe/Rome',
      note: 'Flight lands 14:00',
    },
  ];

  const render = (windows: SpeakerUnavailability[], policy: 'warn' | 'block' = 'warn') =>
    renderToStaticMarkup(
      <ConflictsView
        conflicts={detectConflicts([talk], {}, windows)}
        entries={[talk]}
        timeZone="UTC"
        onOpen={vi.fn()}
        policy={policy}
        canManage
        onPolicyChange={vi.fn()}
        onUnschedule={vi.fn()}
      />,
    );

  it('names the speaker, the session and their reason', () => {
    const html = render(declared);
    expect(html).toContain('Speaker unavailable');
    expect(html).toContain('Cicero');
    expect(html).toContain('On Duties');
    expect(html).toContain('Flight lands 14:00');
  });

  /** One session, so one resolve button — the rail must not offer to unschedule a phantom second. */
  it('offers exactly one resolve action', () => {
    const html = render(declared);
    expect(html.match(/Unschedule On Duties/g)).toHaveLength(1);
  });

  /** It is a warning, so the row must not carry the styling reserved for a physically impossible clash. */
  it('renders as a warning rather than an error', () => {
    const html = render(declared);
    expect(html).toContain('conflictWarning');
    expect(html).not.toContain('conflictError');
  });

  /** The empty state, at the surface a user actually sees. */
  it('says there are no conflicts when nobody declared anything', () => {
    expect(render([])).toContain('No conflicts.');
  });

  /** `block` is about double-bookings; the copy must not promise it polices a declared window. */
  it('does not claim the block policy refuses a declared window', () => {
    expect(render(declared, 'block')).toContain('speaker-declared unavailability are still allowed');
  });
});
