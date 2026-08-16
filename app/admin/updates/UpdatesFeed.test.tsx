import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { OrganizerUpdateItem } from '@/lib/services/updates';
import { UpdatesFeed } from './UpdatesFeed';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const update: OrganizerUpdateItem = {
  id: 'submission-submitted:submission-1:2026-08-15T12:00:00.000Z',
  category: 'submissions',
  title: 'New submission: Machines That Think',
  detail: 'ABS-42 from Ada Lovelace',
  occurredAt: '2026-08-15T12:00:00.000Z',
  href: '/admin/submissions/submission-1',
  tone: 'info',
};

function render(items: OrganizerUpdateItem[]): string {
  return renderToStaticMarkup(
    <UpdatesFeed
      actorId="organizer-1"
      eventId="event-1"
      eventName="Cicero Forum"
      items={items}
      windowStart="2026-07-17T12:00:00.000Z"
      generatedAt="2026-08-16T12:00:00.000Z"
    />,
  );
}

describe('UpdatesFeed', () => {
  it('renders the event rundown, category controls, and an actionable update link', () => {
    const html = render([update]);

    expect(html).toContain('Notifications &amp; updates');
    expect(html).toContain('Cicero Forum');
    expect(html).toContain('Submissions');
    expect(html).toContain('Since last check');
    expect(html).toContain('All recent');
    expect(html).toContain('New submission: Machines That Think');
    expect(html).toContain('ABS-42 from Ada Lovelace');
    expect(html).toContain('href="/admin/submissions/submission-1"');
  });

  it('shows a useful caught-up state when the event has no recent changes', () => {
    const html = render([]);

    expect(html).toContain('Nothing new here');
    expect(html).toContain('No activity in this category during the current 30-day window.');
  });
});
