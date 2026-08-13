import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  COLUMNS,
  DEFAULT_COLUMNS,
  SubmissionQueue,
  viewColumns,
  type QueueProps,
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
