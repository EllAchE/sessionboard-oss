import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SubmissionQueue, type QueueProps } from './SubmissionQueue';

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
