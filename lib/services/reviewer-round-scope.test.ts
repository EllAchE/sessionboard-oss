import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventContext } from '../context';

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('../../db/client', () => ({ getDb: () => state.db }));

import { ANONYMOUS_AUTHOR, loadAssignedReview } from './review';

function queryResult<T>(result: T) {
  const promise = Promise.resolve(result);
  const query = {
    from: () => query,
    innerJoin: () => query,
    where: () => query,
    orderBy: () => query,
    then: promise.then.bind(promise),
  };
  return query;
}

describe('loadAssignedReview round scope', () => {
  beforeEach(() => {
    const oldRound = {
      id: 'round-old',
      eventId: 'event-1',
      name: 'CFP Review',
      position: 0,
      status: 'open',
      blindUntilClose: false,
      anonymized: false,
      opensAt: null,
      closesAt: null,
      createdAt: new Date('2026-08-01T00:00:00Z'),
    };
    const selectedRound = {
      id: 'round-selected',
      eventId: 'event-1',
      name: 'Final Review',
      position: 1,
      status: 'draft',
      blindUntilClose: true,
      anonymized: true,
      opensAt: null,
      closesAt: null,
      createdAt: new Date('2026-08-02T00:00:00Z'),
    };
    const selectedCriteria = [
      {
        id: 'criterion-selected',
        reviewRoundId: selectedRound.id,
        label: 'Final-round fit',
        description: null,
        weight: 2,
        maxScore: 5,
        position: 0,
      },
    ];
    const selectedAssignment = {
      id: 'assignment-selected',
      reviewRoundId: selectedRound.id,
      submissionId: 'submission-shared',
      reviewerUserId: 'reviewer-1',
      status: 'completed',
      comment: 'Selected-round comment',
      completedAt: new Date('2026-08-03T00:00:00Z'),
      reviewerName: 'Reviewer One',
      reviewerEmail: 'reviewer@example.test',
    };
    const assignments = [
      {
        id: 'assignment-old',
        reviewRoundId: oldRound.id,
        submissionId: 'submission-shared',
        reviewerUserId: 'reviewer-1',
        status: 'completed',
      },
      selectedAssignment,
    ];
    const selectResults = [
      [oldRound, selectedRound],
      [oldRound, selectedRound],
      selectedCriteria,
      [],
      [
        {
          participantId: 'speaker-1',
          displayName: 'Visible Speaker',
          jobTitle: 'Engineer',
          company: 'Example Co',
          bioMarkdown: 'Visible bio',
          email: 'speaker@example.test',
          name: 'Visible Speaker',
          isPrimary: true,
          kind: 'speaker',
          position: 0,
        },
      ],
      [selectedAssignment],
      [],
      [
        {
          assignmentId: selectedAssignment.id,
          criterionId: selectedCriteria[0].id,
          value: 5,
        },
      ],
    ];

    state.db = {
      select: () => queryResult(selectResults.shift() ?? []),
      query: {
        reviewAssignment: {
          findFirst: async () =>
            assignments.find((assignment) => assignment.reviewRoundId === selectedRound.id),
        },
        submission: {
          findFirst: async () => ({
            id: 'submission-shared',
            eventId: 'event-1',
            formId: 'form-1',
            submitterUserId: 'speaker-user',
            ref: 1,
            title: 'Shared submission',
            descriptionMarkdown: 'Proposal',
            status: 'under_review',
            level: null,
            trackId: null,
            formatId: null,
            answers: { 'Speaker bio': 'Visible bio', takeaway: 'Scoped correctly' },
            submittedAt: new Date('2026-08-01T00:00:00Z'),
            decidedAt: null,
            decisionNote: null,
          }),
        },
        user: {
          findFirst: async () => ({
            id: 'speaker-user',
            name: 'Visible Speaker',
            email: 'speaker@example.test',
          }),
        },
        /* `CNT-S3`: the detail resolves the submitter's name through this event, not the account. */
        participant: { findFirst: async () => ({ displayName: 'Renamed Speaker' }) },
        aiReview: { findFirst: async () => undefined },
      },
    };
  });

  it('loads the selected assignment, criteria, scores, and anonymization for a multi-round submission', async () => {
    const context: EventContext = {
      actor: {
        userId: 'reviewer-1',
        email: 'reviewer@example.test',
        name: 'Reviewer One',
        impersonatedByUserId: null,
      },
      eventId: 'event-1',
      roles: ['reviewer'],
    };

    const detail = await loadAssignedReview(context, 'submission-shared', 'round-selected');

    expect(detail.round?.id).toBe('round-selected');
    expect(detail.criteria.map((criterion) => criterion.id)).toEqual(['criterion-selected']);
    expect(detail.myAssignmentId).toBe('assignment-selected');
    expect(detail.myScores).toEqual([{ criterionId: 'criterion-selected', value: 5 }]);
    expect(detail.authorHidden).toBe(true);
    expect(detail.submitterName).toBe(ANONYMOUS_AUTHOR);
    expect(detail.speakers[0].name).toBe(ANONYMOUS_AUTHOR);
    expect(detail.answers).toEqual({ takeaway: 'Scoped correctly' });
  });
});
