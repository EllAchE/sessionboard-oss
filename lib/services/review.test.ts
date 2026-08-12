import { describe, expect, it } from 'vitest';
import {
  aggregateScorecard,
  filterQueue,
  isAgendaEligible,
  nextStatusForDecision,
  parseSubmissionImport,
  planAssignments,
  sortQueue,
  summarizeReviews,
  type CriterionSpec,
  type QueueRow,
  type ReviewerScorecard,
} from './review';

const criterion = (over: Partial<CriterionSpec> & { id: string }): CriterionSpec => ({
  label: over.id,
  description: null,
  weight: 1,
  maxScore: 5,
  position: 0,
  ...over,
});

const CRITERIA: CriterionSpec[] = [
  criterion({ id: 'relevance', weight: 2, maxScore: 5, position: 0 }),
  criterion({ id: 'originality', weight: 1, maxScore: 5, position: 1 }),
  criterion({ id: 'readiness', weight: 1, maxScore: 5, position: 2 }),
];

describe('aggregateScorecard', () => {
  it('weights criteria by their weight, not by their count', () => {
    // relevance carries half the total weight, so a 5 there against 1s elsewhere sits above the
    // unweighted mean of 2.33.
    const result = aggregateScorecard(CRITERIA, [
      { criterionId: 'relevance', value: 5 },
      { criterionId: 'originality', value: 1 },
      { criterionId: 'readiness', value: 1 },
    ]);
    expect(result.average).toBe(3);
    expect(result.complete).toBe(true);
    expect(result.scoredCount).toBe(3);
  });

  it('renormalises over the criteria actually scored', () => {
    // Only the 1-weight criterion answered: the average is that score, not that score diluted by
    // implicit zeroes for the two it skipped.
    const partial = aggregateScorecard(CRITERIA, [{ criterionId: 'originality', value: 4 }]);
    expect(partial.average).toBe(4);
    expect(partial.complete).toBe(false);
    expect(partial.scoredCount).toBe(1);
    expect(partial.weightScored).toBe(1);
    expect(partial.weightTotal).toBe(4);
  });

  it('renormalises a partially scored weighted pair', () => {
    // relevance (w2) at 4 and readiness (w1) at 1: (2*0.8 + 1*0.2) / 3 = 0.6 → 3.0 of 5.
    const partial = aggregateScorecard(CRITERIA, [
      { criterionId: 'relevance', value: 4 },
      { criterionId: 'readiness', value: 1 },
    ]);
    expect(partial.average).toBe(3);
    expect(partial.weightScored).toBe(3);
    expect(partial.complete).toBe(false);
  });

  it('is null rather than zero when nothing has been scored', () => {
    const empty = aggregateScorecard(CRITERIA, []);
    expect(empty.average).toBeNull();
    expect(empty.fraction).toBeNull();
    expect(empty.complete).toBe(false);
  });

  it('rescales criteria with different maximums onto one 1-5 axis', () => {
    const mixed: CriterionSpec[] = [
      criterion({ id: 'five', maxScore: 5 }),
      criterion({ id: 'ten', maxScore: 10 }),
    ];
    const result = aggregateScorecard(mixed, [
      { criterionId: 'five', value: 5 },
      { criterionId: 'ten', value: 10 },
    ]);
    expect(result.average).toBe(5);
  });

  it('ignores scores whose criterion no longer exists', () => {
    const result = aggregateScorecard(CRITERIA, [
      { criterionId: 'relevance', value: 5 },
      { criterionId: 'deleted-criterion', value: 1 },
    ]);
    expect(result.average).toBe(5);
    expect(result.scoredCount).toBe(1);
  });

  it('clamps a value above the criterion maximum', () => {
    const result = aggregateScorecard([criterion({ id: 'only' })], [
      { criterionId: 'only', value: 99 },
    ]);
    expect(result.average).toBe(5);
  });

  it('gives a zero-weight criterion no influence', () => {
    const weighted: CriterionSpec[] = [
      criterion({ id: 'counts', weight: 1 }),
      criterion({ id: 'ignored', weight: 0 }),
    ];
    const result = aggregateScorecard(weighted, [
      { criterionId: 'counts', value: 4 },
      { criterionId: 'ignored', value: 1 },
    ]);
    expect(result.average).toBe(4);
  });
});

describe('summarizeReviews', () => {
  const reviewer = (
    id: string,
    scores: Array<[string, number]>,
    status: 'pending' | 'completed' | 'declined' = 'completed',
  ): ReviewerScorecard => ({
    assignmentId: `a-${id}`,
    reviewerUserId: id,
    reviewerName: id,
    reviewerEmail: `${id}@example.test`,
    status,
    comment: null,
    completedAt: null,
    scores: scores.map(([criterionId, value]) => ({ criterionId, value })),
  });

  it('averages reviewers equally however many criteria each filled in', () => {
    const summary = summarizeReviews(CRITERIA, [
      reviewer('full', [
        ['relevance', 5],
        ['originality', 5],
        ['readiness', 5],
      ]),
      reviewer('partial', [['originality', 1]], 'pending'),
    ]);
    expect(summary.average).toBe(3);
    expect(summary.scoredCount).toBe(2);
    expect(summary.completedCount).toBe(1);
    expect(summary.spread).toBe(4);
  });

  it('excludes a reviewer who has scored nothing from the average', () => {
    const summary = summarizeReviews(CRITERIA, [
      reviewer('scored', [['relevance', 4]]),
      reviewer('silent', [], 'pending'),
    ]);
    expect(summary.average).toBe(4);
    expect(summary.assignedCount).toBe(2);
    expect(summary.scoredCount).toBe(1);
    expect(summary.spread).toBeNull();
  });

  it('is null with no assignments at all', () => {
    expect(summarizeReviews(CRITERIA, []).average).toBeNull();
  });
});

describe('nextStatusForDecision', () => {
  it('accepting is what makes a submission agenda-eligible', () => {
    expect(nextStatusForDecision('under_review', 'accept')).toBe('accepted');
    expect(isAgendaEligible('accepted')).toBe(true);
    expect(isAgendaEligible('waitlisted')).toBe(false);
  });

  it('resets back to under_review rather than to submitted', () => {
    expect(nextStatusForDecision('accepted', 'reset')).toBe('under_review');
  });

  it('refuses a draft or a withdrawn talk', () => {
    expect(() => nextStatusForDecision('draft', 'accept')).toThrow();
    expect(() => nextStatusForDecision('withdrawn', 'accept')).toThrow();
  });
});

describe('planAssignments', () => {
  it('spreads submissions evenly across reviewers', () => {
    const plan = planAssignments(['s1', 's2', 's3', 's4'], ['r1', 'r2'], 1);
    expect(plan).toHaveLength(4);
    expect(plan.filter((pair) => pair.reviewerUserId === 'r1')).toHaveLength(2);
    expect(plan.filter((pair) => pair.reviewerUserId === 'r2')).toHaveLength(2);
  });

  it('never puts the same reviewer on a submission twice', () => {
    const plan = planAssignments(['s1'], ['r1', 'r2', 'r3'], 2);
    expect(new Set(plan.map((pair) => pair.reviewerUserId)).size).toBe(2);
  });

  it('counts existing assignments towards a reviewer load', () => {
    const plan = planAssignments(['s2'], ['r1', 'r2'], 1, [
      { submissionId: 's1', reviewerUserId: 'r1' },
    ]);
    expect(plan).toEqual([{ submissionId: 's2', reviewerUserId: 'r2' }]);
  });

  it('tops up only what is missing', () => {
    const plan = planAssignments(['s1'], ['r1', 'r2'], 2, [
      { submissionId: 's1', reviewerUserId: 'r1' },
    ]);
    expect(plan).toEqual([{ submissionId: 's1', reviewerUserId: 'r2' }]);
  });
});

describe('queue filtering and sorting', () => {
  const row = (over: Partial<QueueRow> & { id: string; ref: number }): QueueRow => ({
    displayRef: `ABS-${over.ref}`,
    title: over.id,
    status: 'submitted',
    submittedAt: null,
    decidedAt: null,
    trackId: null,
    trackName: null,
    formatId: null,
    formatName: null,
    level: null,
    tagIds: [],
    submitterName: 'Someone',
    submitterEmail: 'someone@example.test',
    averageScore: null,
    spread: null,
    assignedCount: 0,
    completedCount: 0,
    hasAiReview: false,
    ...over,
  });

  const rows = [
    row({ id: 'a', ref: 1, averageScore: 4.5, status: 'accepted', trackId: 't1' }),
    row({ id: 'b', ref: 2, averageScore: null, status: 'submitted' }),
    row({ id: 'c', ref: 3, averageScore: 2, status: 'declined', tagIds: ['tag1'] }),
    row({ id: 'd', ref: 4, status: 'draft' }),
  ];

  it('sinks unscored rows below scored ones, ties broken by ref', () => {
    expect(sortQueue(rows, 'score_desc').map((entry) => entry.id)).toEqual(['a', 'c', 'b', 'd']);
    expect(sortQueue(rows, 'score_asc').map((entry) => entry.id).slice(0, 2)).toEqual(['c', 'a']);
  });

  it('hides drafts unless the drafts tab asked for them', () => {
    const visible = filterQueue(rows, { statuses: [] });
    expect(visible.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
    expect(filterQueue(rows, { statuses: ['draft'] }).map((entry) => entry.id)).toEqual(['d']);
  });

  it('filters by track, tag and free text', () => {
    expect(filterQueue(rows, { statuses: [], trackId: 't1' }).map((e) => e.id)).toEqual(['a']);
    expect(filterQueue(rows, { statuses: [], tagId: 'tag1' }).map((e) => e.id)).toEqual(['c']);
    expect(filterQueue(rows, { statuses: [], search: 'ABS-2' }).map((e) => e.id)).toEqual(['b']);
  });
});

describe('parseSubmissionImport', () => {
  it('maps aliased headers in any order and defaults the status', () => {
    const parsed = parseSubmissionImport(
      ['Speaker Email,Session Title,Abstract', 'ada@example.test,On Engines,"A talk, with a comma"'].join(
        '\n',
      ),
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([
      {
        title: 'On Engines',
        description: 'A talk, with a comma',
        track: null,
        format: null,
        level: null,
        speakerEmail: 'ada@example.test',
        speakerName: null,
        status: 'submitted',
      },
    ]);
  });

  it('reports the missing columns rather than importing half a file', () => {
    const parsed = parseSubmissionImport('Title\nOn Engines');
    expect(parsed.rows).toEqual([]);
    expect(parsed.errors.some((error) => /Speaker email/i.test(error.message))).toBe(true);
  });

  it('skips a bad row and keeps the good ones', () => {
    const parsed = parseSubmissionImport(
      ['Title,Email', 'Good talk,ada@example.test', 'Bad talk,not-an-email'].join('\n'),
    );
    expect(parsed.rows.map((entry) => entry.title)).toEqual(['Good talk']);
    expect(parsed.errors).toHaveLength(1);
  });
});
