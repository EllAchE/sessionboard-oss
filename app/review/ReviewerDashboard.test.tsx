import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ReviewerDashboard, type ReviewerDashboardProps } from './ReviewerDashboard';

/**
 * A reviewer whose queue is empty used to get a zeroed progress bar over an empty table and a line
 * reading "No tracks assigned; items below were assigned manually" with nothing below it — a page
 * that reads as broken rather than as one with no work in it. Each state below has to say why the
 * queue is empty and that no action is expected.
 */

(globalThis as typeof globalThis & { React: typeof React }).React = React;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const round: NonNullable<ReviewerDashboardProps['round']> = {
  id: 'round-2',
  name: 'Second pass',
  status: 'open',
  blindUntilClose: false,
  anonymized: false,
};

const assignment: ReviewerDashboardProps['assignments'][number] = {
  assignmentId: 'assignment-1',
  submissionId: 'submission-1',
  displayRef: 'ABS-1',
  title: 'On the orator',
  trackName: 'Knowledge',
  formatName: 'Talk',
  level: null,
  status: 'pending',
  comment: null,
  submitterName: 'Cicero',
  average: null,
};

const base: ReviewerDashboardProps = {
  eventName: 'Demo event',
  round,
  rounds: [round],
  authorHidden: false,
  criterionCount: 3,
  assignments: [],
  recused: [],
  pendingCount: 0,
  completedCount: 0,
  coveredTracks: [],
};

const render = (props: Partial<ReviewerDashboardProps>) =>
  renderToStaticMarkup(<ReviewerDashboard {...base} {...props} />);

describe('ReviewerDashboard empty states', () => {
  it('says no action is expected when no round is open', () => {
    const html = render({ round: null, rounds: [] });
    expect(html).toContain('No review round is open');
    expect(html).toContain('nothing for you to do right now');
  });

  it('names the missing routing when the reviewer covers no track', () => {
    const html = render({});
    expect(html).toContain('Nothing is assigned to you');
    expect(html).toContain('not routed to any track');
    expect(html).toContain('no action to take');
  });

  it('names the covered tracks when routing exists but nothing has arrived', () => {
    const html = render({ coveredTracks: ['Knowledge', 'Governance'] });
    expect(html).toContain('You cover Knowledge, Governance.');
    expect(html).toContain('Second pass');
    expect(html).toContain('no action to take');
  });

  it('explains an empty queue that is empty because the reviewer recused', () => {
    const html = render({ recused: [{ ...assignment, status: 'declined' }] });
    expect(html).toContain('Nothing left in your queue');
    expect(html).toContain('the organizer reassigns those proposals');
  });

  /** The zeroed progress bar and the empty table are the two things that made this read as broken. */
  it('drops the progress bar and the assignment table when nothing is assigned', () => {
    const html = render({});
    expect(html).not.toContain('still to score');
    expect(html).not.toContain('Assigned to you');
    expect(html).not.toContain('assigned manually');
    expect(html).not.toContain('0% complete');
  });

  it('keeps the progress bar and table once anything is assigned', () => {
    const html = render({ assignments: [assignment], pendingCount: 1, coveredTracks: ['Knowledge'] });
    expect(html).toContain('still to score');
    expect(html).toContain('Assigned to you');
    expect(html).toContain('On the orator');
    expect(html).not.toContain('Nothing is assigned to you yet');
  });

  it('tells a reviewer with everything scored that there is nothing left to do', () => {
    const html = render({
      assignments: [{ ...assignment, status: 'completed', average: 4.2 }],
      completedCount: 1,
      coveredTracks: ['Knowledge'],
    });
    expect(html).toContain('You are caught up.');
    expect(html).toContain('no action to');
    expect(html).toContain('100% complete');
  });
});
