import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui';
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
          modelConfigured={false}
          canManage
        />
      </ToastProvider>,
    );

    expect(html).toContain('aria-pressed="true">Conference</button>');
    expect(html).not.toContain('>Day</button>');
    expect(html).not.toContain('>Week</button>');

    for (const dayKey of ['2026-09-08', '2026-09-09', '2026-09-10']) {
      expect(html).toContain(`>${formatDayLabel(dayKey, 'UTC')}</button>`);
    }

    expect(html).toContain('aria-label="Schedule for 2026-09-08, 1 rooms"');
    expect(html).not.toContain('aria-label="Schedule for 2026-09-09, 1 rooms"');
  });
});
