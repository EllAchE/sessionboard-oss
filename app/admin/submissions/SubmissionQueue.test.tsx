import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  COLUMNS,
  DEFAULT_COLUMNS,
  SelectionActions,
  SubmissionQueue,
  viewColumns,
  type QueueProps,
  type QueueRowWire,
} from './SubmissionQueue';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const props: QueueProps = {
  rows: [],
  counts: {},
  tabs: [{ id: 'pending', label: 'Pending' }],
  tab: 'pending',
  sort: 'score_desc',
  trackId: '',
  formatId: '',
  tagId: '',
  search: '',
  tracks: [],
  formats: [],
  tags: [],
  rounds: [{ id: 'round-1', name: 'Initial review', status: 'open' }],
  roundId: 'round-1',
  canDecide: true,
  aiEnabled: false,
  savedViews: [],
};

describe('SubmissionQueue review results export', () => {
  it('links an organizer export to the currently selected round', () => {
    const html = renderToStaticMarkup(<SubmissionQueue {...props} />);

    expect(html).toContain('Export CSV');
    expect(html).toContain('href="/admin/submissions/export?round=round-1"');
  });

  it('does not expose the organizer export to reviewers', () => {
    const html = renderToStaticMarkup(<SubmissionQueue {...props} canDecide={false} />);

    expect(html).not.toContain('Export CSV');
    expect(html).not.toContain('/admin/submissions/export');
  });
});

describe('SubmissionQueue saved views', () => {
  it('offers every saved view the organizer has, plus the way to make another', () => {
    const html = renderToStaticMarkup(
      <SubmissionQueue
        {...props}
        savedViews={[
          { id: 'view-1', name: 'Unscored keynotes', filters: { tab: 'pending' } },
          { id: 'view-2', name: 'Declined this year', filters: { tab: 'decided' } },
        ]}
      />,
    );

    expect(html).toContain('Saved views');
    expect(html).toContain('Unscored keynotes');
    expect(html).toContain('Declined this year');
    expect(html).toContain('Save view');
  });

  it('offers the picker but keeps all eight columns until someone changes them', () => {
    const html = renderToStaticMarkup(<SubmissionQueue {...props} />);

    expect(html).toContain(`Columns (${COLUMNS.length}/${COLUMNS.length})`);
    for (const column of COLUMNS) {
      expect(html).toContain(`>${column.label}</th>`);
    }
  });
});

describe('SubmissionQueue staging queues', () => {
  const tabs = [
    { id: 'pending', label: 'Pending', hint: null },
    { id: 'accept-queue', label: 'Accept queue', hint: 'Every review is in.' },
    { id: 'decline-queue', label: 'Decline queue', hint: 'Every review is in.' },
  ];

  it('renders each queue as its own tab, with its count', () => {
    const html = renderToStaticMarkup(
      <SubmissionQueue
        {...props}
        tabs={tabs}
        counts={{ pending: 4, 'accept-queue': 7, 'decline-queue': 2 }}
      />,
    );

    expect(html).toContain('Accept queue');
    expect(html).toContain('Decline queue');
    expect(html).toContain('>7<');
    expect(html).toContain('>2<');
  });

  it('explains a derived queue only while that queue is open', () => {
    const staged = renderToStaticMarkup(
      <SubmissionQueue {...props} tabs={tabs} tab="accept-queue" />,
    );
    expect(staged).toContain('Every review is in.');

    const pending = renderToStaticMarkup(<SubmissionQueue {...props} tabs={tabs} />);
    expect(pending).not.toContain('Every review is in.');
  });
});

/**
 * `V-1`. The organizer-driven half: staging has to be reachable, has to read as something other
 * than a decision, and the batch commit has to say how much it is about to decide.
 */
describe('SubmissionQueue staging controls', () => {
  const row = (over: Partial<QueueRowWire> & { id: string }): QueueRowWire => ({
    ref: 1,
    displayRef: 'ABS-1',
    title: over.id,
    status: 'under_review',
    trackId: null,
    trackName: null,
    formatId: null,
    formatName: null,
    tagIds: [],
    submitterName: 'Someone',
    averageScore: 2.8,
    spread: null,
    assignedCount: 2,
    completedCount: 2,
    stagedDecision: null,
    hasAiReview: false,
    ...over,
  });

  it('says on the row when a person, not a score, put it where it is', () => {
    const html = renderToStaticMarkup(
      <SubmissionQueue
        {...props}
        rows={[
          row({ id: 'staged', stagedDecision: 'accept' }),
          row({ id: 'held', stagedDecision: 'hold' }),
          row({ id: 'plain' }),
        ]}
      />,
    );

    expect(html).toContain('Staged to accept');
    expect(html).toContain('Held back');
    // The status the submission actually has is still beside it; staging never replaces it.
    expect(html).toContain('In review');
  });

  it('leaves an unstaged queue looking exactly as it did', () => {
    const html = renderToStaticMarkup(<SubmissionQueue {...props} rows={[row({ id: 'plain' })]} />);

    expect(html).not.toContain('Staged to');
    expect(html).not.toContain('Held back');
  });

  it('offers the whole-queue commit only inside a staging queue, and counts what it would take', () => {
    const tabs = [
      { id: 'pending', label: 'Pending', hint: null },
      { id: 'accept-queue', label: 'Accept queue', hint: 'Every review is in.' },
    ];
    const rows = [row({ id: 'one' }), row({ id: 'two' })];

    const queue = renderToStaticMarkup(
      <SubmissionQueue {...props} tabs={tabs} tab="accept-queue" rows={rows} />,
    );
    expect(queue).toContain('Accept all 2 shown');

    const pending = renderToStaticMarkup(
      <SubmissionQueue {...props} tabs={tabs} tab="pending" rows={rows} />,
    );
    expect(pending).not.toContain('all 2 shown');
  });

  it('keeps the batch commit away from a reviewer who cannot decide', () => {
    const html = renderToStaticMarkup(
      <SubmissionQueue
        {...props}
        canDecide={false}
        tabs={[{ id: 'accept-queue', label: 'Accept queue', hint: null }]}
        tab="accept-queue"
        rows={[row({ id: 'one' })]}
      />,
    );

    expect(html).not.toContain('Accept all');
  });

  it('advertises the staging shortcuts beside the decision ones it did not change', () => {
    const html = renderToStaticMarkup(<SubmissionQueue {...props} rows={[row({ id: 'one' })]} />);

    expect(html).toContain('accept');
    expect(html).toContain('⇧a');
    expect(html).toContain('⇧d');
    expect(html).toContain('⇧h');
    expect(html).toContain('⇧c');
  });

  it('combines queue placement and decisions in one selection bar', () => {
    const html = renderToStaticMarkup(
      <SelectionActions
        selectedCount={2}
        pending={false}
        onDecide={vi.fn()}
        onStage={vi.fn()}
      />,
    );

    expect(html).toContain('aria-label="Actions for 2 selected"');
    expect(html).toContain('aria-label="Queue selected submissions"');
    expect(html).toContain('Accept queue');
    expect(html).toContain('Decline queue');
    expect(html).toContain('aria-label="Decide selected submissions"');
    expect(html).toContain('Waitlist');
    expect(html).not.toContain('>Reset<');
    expect(html).not.toContain('>Clear<');
  });
});

describe('viewColumns', () => {
  it('keeps a stored subset, in the canonical order rather than the stored one', () => {
    expect(viewColumns(['score', 'title', 'ref'])).toEqual(['ref', 'title', 'score']);
  });

  it('drops column ids that no longer exist', () => {
    expect(viewColumns(['ref', 'spread', 'title'])).toEqual(['ref', 'title']);
  });

  it('falls back to the full set rather than rendering a table with no columns', () => {
    // A view saved before the picker existed, a hand-edited row, or a set of dead ids.
    expect(viewColumns(undefined)).toEqual(DEFAULT_COLUMNS);
    expect(viewColumns('ref,title')).toEqual(DEFAULT_COLUMNS);
    expect(viewColumns([])).toEqual(DEFAULT_COLUMNS);
    expect(viewColumns(['spread'])).toEqual(DEFAULT_COLUMNS);
  });
});

describe('SubmissionQueue permalink copy', () => {
  const row = (over: Partial<QueueRowWire> & { id: string }): QueueRowWire => ({
    ref: 1,
    displayRef: 'ABS-1',
    title: over.id,
    status: 'under_review',
    trackId: null,
    trackName: null,
    formatId: null,
    formatName: null,
    tagIds: [],
    submitterName: 'Someone',
    averageScore: 2.8,
    spread: null,
    assignedCount: 2,
    completedCount: 2,
    stagedDecision: null,
    hasAiReview: false,
    ...over,
  });

  it('offers a copy affordance on each row, named for the proposal it points at', () => {
    const html = renderToStaticMarkup(
      <SubmissionQueue
        {...props}
        rows={[
          row({ id: 'sub-a', displayRef: 'ABS-1' }),
          row({ id: 'sub-b', displayRef: 'ABS-2', ref: 2 }),
        ]}
      />,
    );

    // The label carries the ref because the button is an icon: "Copy link" twice in a row of forty
    // tells a screen-reader user nothing about which link they just took.
    expect(html).toContain('aria-label="Copy link to ABS-1"');
    expect(html).toContain('aria-label="Copy link to ABS-2"');
  });

  it('leaves the row link itself intact beside the copy button', () => {
    const html = renderToStaticMarkup(
      <SubmissionQueue {...props} rows={[row({ id: 'sub-a' })]} />,
    );

    // Copying is an addition to the row, never a replacement for clicking through to it.
    expect(html).toContain('href="/admin/submissions/sub-a"');
    expect(html).toContain('aria-label="Copy link to ABS-1"');
  });
});
