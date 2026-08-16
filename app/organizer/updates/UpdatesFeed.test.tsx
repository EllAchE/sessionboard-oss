import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { OrganizerUpdateItem } from '@/lib/services/updates';
import { partitionUpdates, UpdatesFeed } from './UpdatesFeed';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const update: OrganizerUpdateItem = {
  id: 'submission-submitted:submission-1:2026-08-15T12:00:00.000Z',
  category: 'submissions',
  title: 'New submission: Machines That Think',
  detail: 'ABS-42 from Ada Lovelace',
  occurredAt: '2026-08-15T12:00:00.000Z',
  href: '/organizer/submissions/submission-1',
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
    expect(html).toContain('All updates');
    expect(html).toContain('Unread only');
    expect(html).toContain('Unread');
    expect(html).toContain('New submission: Machines That Think');
    expect(html).toContain('ABS-42 from Ada Lovelace');
    expect(html).toContain('href="/organizer/submissions/submission-1"');
  });

  it('shows a useful caught-up state when the event has no recent changes', () => {
    const html = render([]);

    expect(html).toContain('Nothing new here');
    expect(html).toContain('No activity in this category during the current 30-day window.');
  });

  it('partitions updates at the prior-view boundary so unread can render before earlier items', () => {
    const earlier = {
      ...update,
      id: 'earlier',
      title: 'Earlier update',
      occurredAt: '2026-08-14T12:00:00.000Z',
    };
    const unread = {
      ...update,
      id: 'unread',
      title: 'Unread update',
      occurredAt: '2026-08-16T10:00:00.000Z',
    };

    expect(partitionUpdates([unread, earlier], '2026-08-15T00:00:00.000Z')).toEqual({
      unread: [unread],
      viewed: [earlier],
    });
    expect(partitionUpdates([unread, earlier], null)).toEqual({
      unread: [unread, earlier],
      viewed: [],
    });
    expect(partitionUpdates([unread, earlier], 'invalid stored date')).toEqual({
      unread: [unread, earlier],
      viewed: [],
    });
  });
});
