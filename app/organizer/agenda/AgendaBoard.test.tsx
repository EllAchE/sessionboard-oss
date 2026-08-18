import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui';
import type { PublicHold } from '@/lib/public-visibility';
import { formatDayLabel } from '@/lib/services/schedule';
import { AgendaBoard } from './AgendaBoard';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('./actions', () => ({
  applyProposalAction: vi.fn(),
  deleteSessionAction: vi.fn(),
  placeSessionAction: vi.fn(),
  publishAllAction: vi.fn(),
  saveManualSessionAction: vi.fn(),
  setConflictPolicyAction: vi.fn(),
  setSessionStatusAction: vi.fn(),
  unscheduleSessionAction: vi.fn(),
}));

vi.mock('./AiProposalDialog', () => ({ AiProposalDialog: () => null }));

describe('AgendaBoard conference view', () => {
  it('consolidates day and week into one conference view with a tab for every event day', () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <AgendaBoard
          event={{
            id: 'event-1',
            name: 'Three-day conference',
            slug: 'three-day-conference',
            timezone: 'UTC',
            startsOn: '2026-09-08',
            endsOn: '2026-09-10',
            conflictPolicy: 'warn',
          }}
          rooms={[{ id: 'room-1', name: 'Main hall', capacity: 200, floor: null }]}
          tracks={[]}
          formats={[]}
          entries={[]}
          unavailability={[]}
          queue={[]}
          descriptions={{}}
          publicHolds={{}}
          modelConfigured={false}
          canManage
        />
      </ToastProvider>,
    );

    // The view buttons also announce their chord, so match the pressed state without assuming what
    // sits between it and the label.
    expect(html).toMatch(/aria-pressed="true"[^>]*>Conference<\/button>/);
    expect(html).not.toContain('>Day</button>');
    expect(html).not.toContain('>Week</button>');

    for (const dayKey of ['2026-09-08', '2026-09-09', '2026-09-10']) {
      expect(html).toContain(`>${formatDayLabel(dayKey, 'UTC')}</button>`);
    }

    expect(html).toContain('aria-label="Schedule for 2026-09-08, 1 rooms"');
    expect(html).not.toContain('aria-label="Schedule for 2026-09-09, 1 rooms"');
  });
});

describe('AgendaBoard published-but-not-public count', () => {
  const board = (publicHolds: Record<string, PublicHold[]>) =>
    renderToStaticMarkup(
      <ToastProvider>
        <AgendaBoard
          event={{
            id: 'event-1',
            name: 'DevFlow Conf',
            slug: 'devflow-conf',
            timezone: 'UTC',
            startsOn: '2026-09-08',
            endsOn: '2026-09-08',
            conflictPolicy: 'warn',
          }}
          rooms={[{ id: 'room-1', name: 'Main stage', capacity: 200, floor: null }]}
          tracks={[]}
          formats={[]}
          entries={[
            {
              id: 'session-1',
              ref: 1,
              title: 'Lightning: Agents in Production',
              submissionId: 'sub-1',
              roomId: 'room-1',
              trackId: null,
              formatId: null,
              startsAt: '2026-09-08T09:00:00.000Z',
              endsAt: '2026-09-08T09:30:00.000Z',
              status: 'published',
              ceuCredits: null,
              clientId: null,
              speakers: [],
            },
          ]}
          unavailability={[]}
          queue={[]}
          descriptions={{}}
          publicHolds={publicHolds}
          modelConfigured={false}
          canManage
        />
      </ToastProvider>,
    );

  it('stays quiet when publishing was enough', () => {
    expect(board({})).not.toContain('not public yet');
  });

  /**
   * The run's complaint in one assertion: the header said "1 published" while the public agenda
   * said none, and the two numbers never acknowledged each other.
   */
  it('counts a published session its approval state is still holding back', () => {
    const html = board({
      'session-1': [{ kind: 'content_status', status: 'in_review' }],
    });

    expect(html).toContain('1 published');
    expect(html).toContain('1 not public yet');
  });

  /** An unconfirmed speaker trims the byline; the session itself still reaches attendees. */
  it('does not count a session that is public with a name missing', () => {
    const html = board({
      'session-1': [{ kind: 'unconfirmed_speakers', names: ['Marcus Okafor'] }],
    });

    expect(html).toContain('1 published');
    expect(html).not.toContain('not public yet');
  });
});
