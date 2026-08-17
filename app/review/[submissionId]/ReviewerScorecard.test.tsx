import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ReviewerScorecard, type ReviewerScorecardProps } from './ReviewerScorecard';

/**
 * `ABS-03`. The reviewer form has to render a criterion as whatever its type says it is: a rating
 * takes stars, a dropdown takes the organizer's choices, and a written criterion takes a text area.
 * A stored answer of any of the three has to come back into the control it belongs to.
 */

(globalThis as typeof globalThis & { React: typeof React }).React = React;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const props: ReviewerScorecardProps = {
  submissionId: 'submission-1',
  displayRef: 'ABS-1',
  title: 'On the orator',
  descriptionHtml: '',
  status: 'under_review',
  level: null,
  trackName: null,
  formatName: null,
  tags: [],
  answers: [],
  authorHidden: false,
  submitterName: 'Speaker',
  speakers: [],
  round: {
    id: 'round-1',
    name: 'Round one',
    status: 'open',
    blindUntilClose: true,
    anonymized: false,
  },
  criteria: [
    {
      id: 'relevance',
      label: 'Relevance',
      description: null,
      type: 'numeric',
      options: [],
      weight: 2,
      maxScore: 5,
    },
    {
      id: 'recommendation',
      label: 'Recommendation',
      description: null,
      type: 'select',
      options: ['Accept', 'Maybe', 'Reject'],
      weight: 0,
      maxScore: 5,
    },
    {
      id: 'comments',
      label: 'Comments',
      description: null,
      type: 'text',
      options: [],
      weight: 0,
      maxScore: 5,
    },
  ],
  myScores: [],
  myComment: null,
  myAssignmentId: 'assignment-1',
  mySubmitted: false,
  blinded: false,
  peerCount: 0,
  prevHref: null,
  nextHref: null,
  position: 1,
  total: 1,
};

describe('the reviewer scorecard renders a criterion as its type', () => {
  it('gives a dropdown the organizer’s choices and a written criterion a text area', () => {
    const html = renderToStaticMarkup(<ReviewerScorecard {...props} />);

    expect(html).toContain('aria-label="Recommendation"');
    expect(html).toContain('<option value="Accept">Accept</option>');
    expect(html).toContain('<option value="Maybe">Maybe</option>');
    expect(html).toContain('<option value="Reject">Reject</option>');
    expect(html).toContain('rows="4" aria-label="Comments"');
    // The rating still gets stars rather than a box to type a number into.
    expect(html).toContain('role="radiogroup" aria-label="Relevance"');
    expect(html).not.toContain('<option value="Relevance"');
  });

  it('puts a stored answer of each type back into its own control', () => {
    const html = renderToStaticMarkup(
      <ReviewerScorecard
        {...props}
        myScores={[
          { criterionId: 'relevance', value: 4, text: null },
          { criterionId: 'recommendation', value: null, text: 'Accept' },
          { criterionId: 'comments', value: null, text: 'Strong fit for the opening track.' },
        ]}
        mySubmitted
      />,
    );

    expect(html).toContain('<option value="Accept" selected="">Accept</option>');
    expect(html).toContain(
      'aria-label="Comments">Strong fit for the opening track.</textarea>',
    );
    // The rating is the only thing that reaches the average, and it survived the round trip.
    expect(html).toContain('>4/5</span>');
    expect(html).toContain('>4.0</span>');
  });
});
