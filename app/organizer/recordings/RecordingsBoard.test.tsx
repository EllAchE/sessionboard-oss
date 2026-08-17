import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui';
import { RecordingsBoard, formatSessionDateTime } from './RecordingsBoard';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe('recordings presentation', () => {
  it('formats session timestamps in the event timezone on both server and client', () => {
    expect(formatSessionDateTime('2026-09-27T18:15:00.000Z', 'America/New_York')).toBe(
      '9/27/2026, 2:15 PM',
    );
  });

  it('renders the deterministic event-local timestamp into the recording row', () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <RecordingsBoard
          eventSlug="forum"
          eventTimeZone="America/New_York"
          choices={[]}
          rows={[
            {
              session: {
                id: 'session-1',
                ref: 1,
                title: 'Opening address',
                startsAt: '2026-09-27T18:15:00.000Z',
                endsAt: null,
                status: 'published',
              },
              recording: null,
              file: null,
              publicationIssue: null,
            },
          ]}
        />
      </ToastProvider>,
    );

    expect(html).toContain(
      '<time dateTime="2026-09-27T18:15:00.000Z">9/27/2026, 2:15 PM</time>',
    );
  });
});
