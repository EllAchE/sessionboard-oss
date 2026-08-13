import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ReviewDetail, type ReviewDetailProps } from './ReviewDetail';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const props: ReviewDetailProps = {
  submissionId: 'submission-1',
  displayRef: 'ABS-1',
  title: 'A submission',
  status: 'under_review',
  descriptionHtml: '',
  level: null,
  trackName: null,
  formatName: null,
  tags: [],
  answers: [],
  submittedAt: null,
  decidedAt: null,
  decisionNote: null,
  submitterName: 'Speaker',
  submitterEmail: 'speaker@example.test',
  speakers: [],
  round: { id: 'round-1', name: 'Initial review', status: 'open', blindUntilClose: true },
  criteria: [],
  myScores: [],
  myComment: null,
  mySubmitted: false,
  myAverage: null,
  reviewers: [
    {
      assignmentId: 'assignment-1',
      reviewerUserId: 'reviewer-1',
      reviewerName: 'Reviewer One',
      status: 'pending',
      comment: null,
      completedAt: null,
      average: null,
      isMe: false,
    },
  ],
  availableReviewers: [
    { userId: 'reviewer-1', name: 'Reviewer One', email: 'one@example.test' },
    { userId: 'reviewer-2', name: 'Reviewer Two', email: 'two@example.test' },
  ],
  routedReviewerUserIds: [],
  conflictedReviewerUserIds: [],
  summary: {
    average: null,
    spread: null,
    assignedCount: 1,
    completedCount: 0,
    scoredCount: 0,
  },
  blinded: false,
  ai: null,
  aiEnabled: false,
  aiModelConfigured: false,
  canDecide: true,
  prevHref: null,
  nextHref: null,
  position: 1,
  total: 1,
  backHref: '/admin/submissions',
};

describe('ReviewDetail reviewer assignments', () => {
  it('shows every event reviewer and checks only the reviewer assigned to this submission', () => {
    const html = renderToStaticMarkup(<ReviewDetail {...props} />);

    expect(html).toContain('Reviewer assignments');
    expect(html).toContain('Reviewer One · one@example.test');
    expect(html).toContain('Reviewer Two · two@example.test');
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
    expect(html.match(/checked=""/g)).toHaveLength(1);
  });

  it('marks who the track routes to and who wrote the talk', () => {
    const html = renderToStaticMarkup(
      <ReviewDetail
        {...props}
        trackName="Infrastructure"
        routedReviewerUserIds={['reviewer-2']}
        conflictedReviewerUserIds={['reviewer-1']}
      />,
    );

    expect(html).toContain('Covers this track');
    expect(html).toContain('Speaks on this talk');
    expect(html).toContain('covering Infrastructure');
  });

  it('says plainly when a track has nobody covering it', () => {
    const html = renderToStaticMarkup(<ReviewDetail {...props} trackName="Infrastructure" />);

    expect(html).toContain('Nobody covers Infrastructure yet');
  });

  it('does not expose assignment controls without decision permission', () => {
    const html = renderToStaticMarkup(<ReviewDetail {...props} canDecide={false} />);

    expect(html).not.toContain('Reviewer assignments');
    expect(html).not.toContain('one@example.test');
  });
});
