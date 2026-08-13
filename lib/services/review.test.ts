import { describe, expect, it } from 'vitest';
import type { EventContext, MembershipRole } from '../context';
import {
  ANONYMOUS_AUTHOR,
  DECISION_QUEUE_BAR,
  STATUS_TABS,
  aggregateScorecard,
  carriesIdentity,
  decisionStage,
  filterQueue,
  filtersForTab,
  hidesAuthorship,
  isAgendaEligible,
  nextStatusForDecision,
  parseSubmissionImport,
  planAssignments,
  planRoutedAssignments,
  redactAuthorship,
  redactSubmitter,
  reminderBody,
  sortQueue,
  summarizeReviews,
  type AuthoredSubject,
  type CriterionSpec,
  type ReviewAnswerField,
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

  it('matches the reviewer preview to the persisted weighted average', () => {
    const result = aggregateScorecard(
      [
        criterion({ id: 'relevance', weight: 2 }),
        criterion({ id: 'depth', weight: 2 }),
        criterion({ id: 'readiness', weight: 1 }),
      ],
      [
        { criterionId: 'relevance', value: 2 },
        { criterionId: 'depth', value: 4 },
        { criterionId: 'readiness', value: 4 },
      ],
    );

    expect(result.average).toBe(3.2);
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

describe('planRoutedAssignments — the routing model `F-3` and `V-5` share', () => {
  const infra = 'track-infra';
  const law = 'track-law';
  const coverage = new Map([
    [infra, ['aqueduct-reader', 'generalist']],
    [law, ['court-reader', 'generalist']],
  ]);
  const pool = ['aqueduct-reader', 'court-reader', 'generalist'];
  const load = (plan: { pairs: Array<{ reviewerUserId: string }> }, reviewerUserId: string) =>
    plan.pairs.filter((pair) => pair.reviewerUserId === reviewerUserId).length;

  it('sends a submission only to the reviewers covering its track', () => {
    const plan = planRoutedAssignments({
      submissions: [{ submissionId: 's1', trackId: infra }],
      pool,
      coverage,
      reviewersPerSubmission: 2,
    });

    expect(plan.unroutable).toEqual([]);
    expect(new Set(plan.pairs.map((pair) => pair.reviewerUserId))).toEqual(
      new Set(['aqueduct-reader', 'generalist']),
    );
  });

  it('balances inside the routed pool rather than across the whole panel', () => {
    const plan = planRoutedAssignments({
      submissions: ['s1', 's2', 's3', 's4'].map((submissionId) => ({
        submissionId,
        trackId: infra,
      })),
      pool,
      coverage,
      reviewersPerSubmission: 1,
    });

    expect(load(plan, 'court-reader')).toBe(0);
    expect(load(plan, 'aqueduct-reader')).toBe(2);
    expect(load(plan, 'generalist')).toBe(2);
  });

  it('keeps one load ledger for a reviewer who covers several tracks', () => {
    const plan = planRoutedAssignments({
      submissions: [
        { submissionId: 'law-1', trackId: law },
        { submissionId: 'infra-1', trackId: infra },
        { submissionId: 'infra-2', trackId: infra },
      ],
      pool,
      coverage: new Map([
        [infra, ['aqueduct-reader', 'generalist']],
        [law, ['generalist']],
      ]),
      reviewersPerSubmission: 1,
    });

    // The generalist covers both tracks and the law talk could go nowhere else. A ledger kept per
    // track would forget that and hand them an infrastructure talk as well; one shared ledger
    // remembers, and the two infrastructure talks go to the reviewer who has done nothing yet.
    expect(load(plan, 'generalist')).toBe(1);
    expect(load(plan, 'aqueduct-reader')).toBe(2);
  });

  it('reports a track nobody covers instead of assigning it to whoever is free', () => {
    const plan = planRoutedAssignments({
      submissions: [{ submissionId: 's1', trackId: 'track-uncovered' }],
      pool,
      coverage,
      reviewersPerSubmission: 2,
    });

    expect(plan.pairs).toEqual([]);
    expect(plan.unroutable).toEqual([{ submissionId: 's1', reason: 'track_uncovered' }]);
  });

  it('reports a submission that arrived without a track', () => {
    const plan = planRoutedAssignments({
      submissions: [{ submissionId: 's1', trackId: null }],
      pool,
      coverage,
      reviewersPerSubmission: 1,
    });

    expect(plan.pairs).toEqual([]);
    expect(plan.unroutable).toEqual([{ submissionId: 's1', reason: 'no_track' }]);
  });

  it('never gives a reviewer their own talk, and says so when that empties the track', () => {
    const plan = planRoutedAssignments({
      submissions: [
        { submissionId: 'own-talk', trackId: infra },
        { submissionId: 'sole-reader-talk', trackId: law },
      ],
      pool,
      coverage: new Map([
        [infra, ['aqueduct-reader', 'generalist']],
        [law, ['court-reader']],
      ]),
      reviewersPerSubmission: 2,
      conflicts: new Map([
        ['own-talk', new Set(['aqueduct-reader'])],
        ['sole-reader-talk', new Set(['court-reader'])],
      ]),
    });

    expect(plan.pairs).toEqual([{ submissionId: 'own-talk', reviewerUserId: 'generalist' }]);
    expect(plan.unroutable).toEqual([
      { submissionId: 'sole-reader-talk', reason: 'all_conflicted' },
    ]);
  });

  it('falls back to the whole pool only when asked, and still keeps conflicts out', () => {
    const plan = planRoutedAssignments({
      submissions: [{ submissionId: 's1', trackId: null }],
      pool,
      coverage,
      reviewersPerSubmission: 3,
      conflicts: new Map([['s1', new Set(['generalist'])]]),
      fallbackToPool: true,
    });

    expect(plan.unroutable).toEqual([]);
    expect(new Set(plan.pairs.map((pair) => pair.reviewerUserId))).toEqual(
      new Set(['aqueduct-reader', 'court-reader']),
    );
  });

  it('routes to the whole pool while no track has been covered at all', () => {
    const plan = planRoutedAssignments({
      submissions: [{ submissionId: 's1', trackId: null }],
      pool,
      coverage: new Map(),
      reviewersPerSubmission: 1,
    });

    expect(plan.unroutable).toEqual([]);
    expect(plan.pairs).toHaveLength(1);
  });

  it('leaves a hand-assigned submission alone rather than calling it unroutable', () => {
    const plan = planRoutedAssignments({
      submissions: [{ submissionId: 's1', trackId: 'track-uncovered' }],
      pool,
      coverage,
      reviewersPerSubmission: 2,
      existing: [{ submissionId: 's1', reviewerUserId: 'generalist' }],
    });

    expect(plan.pairs).toEqual([]);
    expect(plan.unroutable).toEqual([]);
  });

  it('tops a routed submission up without repeating a reviewer already on it', () => {
    const plan = planRoutedAssignments({
      submissions: [{ submissionId: 's1', trackId: infra }],
      pool,
      coverage,
      reviewersPerSubmission: 2,
      existing: [{ submissionId: 's1', reviewerUserId: 'aqueduct-reader' }],
    });

    expect(plan.pairs).toEqual([{ submissionId: 's1', reviewerUserId: 'generalist' }]);
  });

  it('ignores coverage naming a reviewer the organizer left out of this round', () => {
    const plan = planRoutedAssignments({
      submissions: [{ submissionId: 's1', trackId: infra }],
      pool: ['court-reader'],
      coverage,
      reviewersPerSubmission: 1,
    });

    expect(plan.pairs).toEqual([]);
    expect(plan.unroutable).toEqual([{ submissionId: 's1', reason: 'track_uncovered' }]);
  });

  it('asks for more reviewers than a track has without inventing one', () => {
    const plan = planRoutedAssignments({
      submissions: [{ submissionId: 's1', trackId: law }],
      pool,
      coverage: new Map([[law, ['court-reader']]]),
      reviewersPerSubmission: 3,
    });

    expect(plan.pairs).toEqual([{ submissionId: 's1', reviewerUserId: 'court-reader' }]);
    expect(plan.unroutable).toEqual([]);
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
    declinedCount: 0,
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

/**
 * `V-1`, `V-4`. The staging queues are read off the panel's own work rather than stored, so these
 * pin the reading down: what puts a proposal in one, what keeps it out, and the fact that Pending,
 * the accept queue and the decline queue partition the undecided set instead of overlapping it.
 */
describe('accept and decline queues', () => {
  const row = (over: Partial<QueueRow> & { id: string }): QueueRow => ({
    ref: 1,
    displayRef: 'ABS-1',
    title: over.id,
    status: 'under_review',
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
    averageScore: 4,
    spread: null,
    assignedCount: 2,
    completedCount: 2,
    declinedCount: 0,
    hasAiReview: false,
    ...over,
  });

  it('stages a finished proposal by which side of the bar it landed on', () => {
    expect(decisionStage(row({ id: 'high', averageScore: 4.2 }))).toBe('accept');
    expect(decisionStage(row({ id: 'bar', averageScore: DECISION_QUEUE_BAR }))).toBe('accept');
    expect(decisionStage(row({ id: 'low', averageScore: 2.9 }))).toBe('decline');
  });

  it('waits for every review before staging anything', () => {
    expect(decisionStage(row({ id: 'half', completedCount: 1 }))).toBeNull();
    expect(decisionStage(row({ id: 'none', assignedCount: 0, completedCount: 0 }))).toBeNull();
    // Assigned, answered, and nobody put a number on it: there is no recommendation to read.
    expect(decisionStage(row({ id: 'unscored', averageScore: null }))).toBeNull();
  });

  it('does not let a reviewer who turned the assignment down hold the queue open', () => {
    // A declined assignment never completes, so counting it as outstanding would strand the row.
    expect(decisionStage(row({ id: 'declined-one', completedCount: 1, declinedCount: 1 }))).toBe(
      'accept',
    );
  });

  it('stages only what is still undecided', () => {
    for (const status of ['accepted', 'declined', 'waitlisted', 'withdrawn', 'draft'] as const) {
      expect(decisionStage(row({ id: status, status }))).toBeNull();
    }
    expect(decisionStage(row({ id: 'submitted', status: 'submitted' }))).toBe('accept');
  });

  it('splits the undecided set between Pending and the two queues, never counting one twice', () => {
    const rows = [
      row({ id: 'accept-me', averageScore: 4.4 }),
      row({ id: 'decline-me', averageScore: 2.1 }),
      row({ id: 'still-scoring', completedCount: 1 }),
      row({ id: 'unassigned', assignedCount: 0, completedCount: 0, averageScore: null }),
      row({ id: 'already-accepted', status: 'accepted' }),
    ];
    const idsForTab = (tab: string) =>
      filterQueue(rows, filtersForTab(tab)).map((entry) => entry.id);

    expect(idsForTab('accept-queue')).toEqual(['accept-me']);
    expect(idsForTab('decline-queue')).toEqual(['decline-me']);
    expect(idsForTab('pending')).toEqual(['still-scoring', 'unassigned']);
    expect(idsForTab('accepted')).toEqual(['already-accepted']);
    // `All` still shows everything undecided or decided, queues included.
    expect(idsForTab('all')).toHaveLength(5);
  });

  it('gives each queue a tab of its own, ahead of the status it commits to', () => {
    const ids = STATUS_TABS.map((tab) => tab.id);
    expect(ids).toContain('accept-queue');
    expect(ids).toContain('decline-queue');
    expect(ids.indexOf('accept-queue')).toBeLessThan(ids.indexOf('accepted'));
    expect(ids.indexOf('decline-queue')).toBeLessThan(ids.indexOf('declined'));
    // Derived, so each one says what put a proposal in it.
    for (const id of ['accept-queue', 'decline-queue']) {
      expect(STATUS_TABS.find((tab) => tab.id === id)?.hint).toBeTruthy();
    }
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

const contextFor = (...roles: MembershipRole[]): EventContext => ({
  actor: { userId: 'u1', email: 'u1@example.test', name: 'Ada', impersonatedByUserId: null },
  eventId: 'e1',
  roles,
});

describe('hidesAuthorship', () => {
  it('hides the author from a reviewer on an anonymized round', () => {
    expect(hidesAuthorship({ anonymized: true }, contextFor('reviewer'))).toBe(true);
  });

  it('never hides the author from an organizer, who still has to run conflict checks', () => {
    expect(hidesAuthorship({ anonymized: true }, contextFor('organizer'))).toBe(false);
    expect(hidesAuthorship({ anonymized: true }, contextFor('organizer', 'reviewer'))).toBe(false);
  });

  it('leaves a normal round alone', () => {
    expect(hidesAuthorship({ anonymized: false }, contextFor('reviewer'))).toBe(false);
    expect(hidesAuthorship(null, contextFor('reviewer'))).toBe(false);
  });
});

describe('carriesIdentity', () => {
  it('catches identity questions however the form spelled them', () => {
    for (const key of ['Speaker name', 'company', 'your_email', 'linkedin-url', 'Job title']) {
      expect(carriesIdentity(key)).toBe(true);
    }
  });

  it('leaves substantive questions in place', () => {
    for (const key of ['Why this talk', 'prerequisites', 'session_outline']) {
      expect(carriesIdentity(key)).toBe(false);
    }
  });
});

describe('redactAuthorship', () => {
  const subject: AuthoredSubject = {
    submitterName: 'Priya Raman',
    submitterEmail: 'priya@latticework.example',
    speakers: [
      {
        participantId: 'p1',
        name: 'Priya Raman',
        email: 'priya@latticework.example',
        jobTitle: 'Principal Engineer',
        company: 'Latticework Systems',
        bioMarkdown: 'Priya leads the build-tooling platform team.',
        isPrimary: true,
        kind: 'speaker',
      },
      {
        participantId: 'p2',
        name: 'Charles Babbage',
        email: 'charles@example.test',
        jobTitle: 'Engineer',
        company: 'Analytical Engines',
        bioMarkdown: null,
        isPrimary: false,
        kind: 'speaker',
      },
    ],
    answers: {
      custom_1a2b: 'Priya Raman',
      custom_2b3c: 'Latticework Systems',
      custom_3c4d: 'priya@latticework.example',
      custom_4d5e: 'She leads the build-tooling platform team.',
      why_this_talk: 'Because engines matter',
    },
    answerLabels: {
      custom_1a2b: 'Speaker name',
      custom_2b3c: 'Affiliation',
      custom_3c4d: 'How may we reach you?',
      custom_4d5e: 'Speaker bio',
      why_this_talk: 'Why this talk',
    },
  };

  const fields: ReviewAnswerField[] = [
    { key: 'custom_1a2b', label: 'Speaker name', type: 'short_text', builtinKey: null },
    { key: 'custom_2b3c', label: 'Affiliation', type: 'short_text', builtinKey: null },
    { key: 'custom_3c4d', label: 'How may we reach you?', type: 'email', builtinKey: null },
    { key: 'custom_4d5e', label: 'Speaker bio', type: 'long_text', builtinKey: null },
    { key: 'why_this_talk', label: 'Why this talk', type: 'long_text', builtinKey: null },
  ];

  it('strips every identity channel from the anonymized reviewer output', () => {
    const redacted = redactAuthorship(subject, fields);
    expect(redacted.submitterName).toBe(ANONYMOUS_AUTHOR);
    expect(redacted.submitterEmail).toBe('');
    expect(redacted.speakers.map((speaker) => speaker.name)).toEqual([
      `${ANONYMOUS_AUTHOR} 1`,
      `${ANONYMOUS_AUTHOR} 2`,
    ]);
    expect(redacted.speakers.every((speaker) => speaker.email === '')).toBe(true);
    expect(redacted.speakers.every((speaker) => speaker.company === null)).toBe(true);
    expect(redacted.speakers.every((speaker) => speaker.bioMarkdown === null)).toBe(true);
    expect(redacted.answers).toEqual({ why_this_talk: 'Because engines matter' });
    expect(redacted.answerLabels).toEqual({ why_this_talk: 'Why this talk' });
    const reviewerOutput = JSON.stringify(redacted);
    for (const identity of [
      'Priya Raman',
      'Latticework Systems',
      'priya@latticework.example',
      'leads the build-tooling platform team',
    ]) {
      expect(reviewerOutput).not.toContain(identity);
    }
  });

  it('does not leak an identity through the participant id either', () => {
    const redacted = redactAuthorship(subject, fields);
    expect(redacted.speakers.map((speaker) => speaker.participantId)).toEqual([
      'anonymous-0',
      'anonymous-1',
    ]);
  });

  it('retains the full speaker profile and answer for an organizer', () => {
    const organizerOutput = hidesAuthorship({ anonymized: true }, contextFor('organizer'))
      ? redactAuthorship(subject, fields)
      : subject;
    const serialized = JSON.stringify(organizerOutput);
    for (const identity of [
      'Priya Raman',
      'Latticework Systems',
      'priya@latticework.example',
      'leads the build-tooling platform team',
    ]) {
      expect(serialized).toContain(identity);
    }
  });

  it('redacts a queue row without needing the full speaker list', () => {
    const row = { submitterName: 'Ada Lovelace', submitterEmail: 'ada@example.test', title: 'On Engines' };
    expect(redactSubmitter(row)).toEqual({
      submitterName: ANONYMOUS_AUTHOR,
      submitterEmail: '',
      title: 'On Engines',
    });
  });
});

describe('reminderBody', () => {
  it('names what the reviewer still owes and links them straight to it', () => {
    const body = reminderBody(
      {
        reviewerUserId: 'u2',
        name: 'Grace',
        email: 'grace@example.test',
        outstanding: [
          { displayRef: 'ABS-12', title: 'On Engines' },
          { displayRef: 'ABS-14', title: 'On Compilers' },
        ],
      },
      { name: 'Round one', closesAt: new Date('2026-09-01T00:00:00Z') },
      'https://cicero.test/review',
      'Please finish before the programme meeting.',
    );

    expect(body).toContain('Hi Grace,');
    expect(body).toContain('2 submissions still waiting');
    expect(body).toContain('ABS-12 — On Engines');
    expect(body).toContain('https://cicero.test/review');
    expect(body).toContain('2026-09-01');
    expect(body).toContain('Please finish before the programme meeting.');
  });

  it('speaks in the singular for a single outstanding review', () => {
    const body = reminderBody(
      { reviewerUserId: 'u2', name: 'Grace', email: 'grace@example.test', outstanding: [{ displayRef: 'ABS-12', title: 'On Engines' }] },
      { name: 'Round one', closesAt: null },
      'https://cicero.test/review',
    );
    expect(body).toContain('1 submission still waiting');
  });
});
