import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { dropReviewFixture, seedReviewFixture, type ReviewFixture } from '@/db/testing';
import { isAppError } from '@/lib/errors';
import * as review from './review';

/**
 * The review service against a real Postgres.
 *
 * The unit tests around these routes mock at the service boundary, which is fast and covers the
 * routes' own decisions — but it means the rules the service actually enforces, the ones an
 * organizer would call security, were asserted against stubs that always said yes. Authorization,
 * anonymity and the blind-until-close rule can only be trusted against real rows and real SQL, so
 * that is what this file covers, and it deliberately does not re-test what the unit suite already
 * pins.
 *
 * Requires DATABASE_URL and a migrated database: `bun run test:integration`.
 */

const fixtures: ReviewFixture[] = [];

async function seed(options?: Parameters<typeof seedReviewFixture>[0]): Promise<ReviewFixture> {
  const fixture = await seedReviewFixture(options);
  fixtures.push(fixture);
  return fixture;
}

/** Surfaces a missing database as one clear line rather than a stack per test. */
beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set. Start Postgres and run `bun run db:migrate` first — see README.',
    );
  }
});

afterEach(async () => {
  while (fixtures.length > 0) await dropReviewFixture(fixtures.pop()!);
});

const message = (error: unknown) => (isAppError(error) ? error.message : String(error));

describe('the capability gate, against real rows', () => {
  it('refuses a speaker who has a membership but not a reviewing one', async () => {
    const fixture = await seed();

    await expect(
      review.loadReviewerQueue(fixture.ctx(fixture.author, 'speaker'), null),
    ).rejects.toSatisfy((error: unknown) => message(error).includes('submission:review'));
  });

  it('lets an assigned reviewer read their own queue', async () => {
    const fixture = await seed();

    const queue = await review.loadReviewerQueue(fixture.ctx(fixture.reviewer, 'reviewer'), null);

    expect(queue.assignments.map((row) => row.submissionId)).toEqual([fixture.submissionId]);
    expect(queue.pendingCount).toBe(1);
    expect(queue.completedCount).toBe(0);
  });
});

describe('assignment is what grants access', () => {
  it('refuses a submission the reviewer was never assigned', async () => {
    // The unit tests could only assert the route turns a thrown error into a 404. This asserts the
    // service actually throws for an unassigned petition in the same event.
    const fixture = await seed();

    await expect(
      review.loadAssignedReview(
        fixture.ctx(fixture.reviewer, 'reviewer'),
        fixture.otherSubmissionId,
        fixture.roundId,
      ),
    ).rejects.toBeDefined();
  });

  it('lets an organizer read a submission nobody assigned them', async () => {
    const fixture = await seed();

    const detail = await review.loadAssignedReview(
      fixture.ctx(fixture.organizer, 'organizer'),
      fixture.otherSubmissionId,
      fixture.roundId,
    );

    expect(detail.id).toBe(fixture.otherSubmissionId);
  });

  it('refuses to score a submission the reviewer was never assigned', async () => {
    const fixture = await seed();

    await expect(
      review.saveScorecard(fixture.ctx(fixture.reviewer, 'reviewer'), {
        roundId: fixture.roundId,
        submissionId: fixture.otherSubmissionId,
        scores: [{ criterionId: fixture.criteria[0].id, value: 5 }],
      }),
    ).rejects.toBeDefined();
  });

  it('refuses to recuse an appointment belonging to another councillor', async () => {
    const fixture = await seed();

    await expect(
      review.declineAssignment(
        fixture.ctx(fixture.reviewer, 'reviewer'),
        fixture.peerAssignmentId,
        'not mine to decline',
      ),
    ).rejects.toSatisfy((error: unknown) => message(error).includes('belongs to another reviewer'));
  });
});

describe('scoring, persisted', () => {
  it('weights the average by criterion weight and survives a reload', async () => {
    const fixture = await seed();
    const ctx = fixture.ctx(fixture.reviewer, 'reviewer');
    const [relevance, originality, readiness] = fixture.criteria;

    const saved = await review.saveScorecard(ctx, {
      roundId: fixture.roundId,
      submissionId: fixture.submissionId,
      scores: [
        { criterionId: relevance.id, value: 5 },
        { criterionId: originality.id, value: 1 },
        { criterionId: readiness.id, value: 1 },
      ],
      comment: 'Worthy of the Forum.',
      complete: true,
    });

    // Relevance carries half the total weight, so this sits above the unweighted mean of 2.33.
    expect(saved.aggregate.average).toBe(3);
    expect(saved.aggregate.complete).toBe(true);

    const reloaded = await review.loadAssignedReview(ctx, fixture.submissionId, fixture.roundId);
    expect(reloaded.myComment).toBe('Worthy of the Forum.');
    expect(reloaded.myAssignmentStatus).toBe('completed');
    expect(
      reloaded.myScores.find((score) => score.criterionId === relevance.id)?.value,
    ).toBe(5);
  });

  it('replaces an earlier score for the same criterion instead of adding a second row', async () => {
    const fixture = await seed();
    const ctx = fixture.ctx(fixture.reviewer, 'reviewer');
    const [relevance] = fixture.criteria;

    await review.saveScorecard(ctx, {
      roundId: fixture.roundId,
      submissionId: fixture.submissionId,
      scores: [{ criterionId: relevance.id, value: 2 }],
    });
    await review.saveScorecard(ctx, {
      roundId: fixture.roundId,
      submissionId: fixture.submissionId,
      scores: [{ criterionId: relevance.id, value: 4 }],
    });

    const reloaded = await review.loadAssignedReview(ctx, fixture.submissionId, fixture.roundId);
    const mine = reloaded.myScores.filter((score) => score.criterionId === relevance.id);
    expect(mine).toHaveLength(1);
    expect(mine[0].value).toBe(4);
  });

  it('moves a recused assignment out of the queue and into the recused list', async () => {
    const fixture = await seed();
    const ctx = fixture.ctx(fixture.reviewer, 'reviewer');

    await review.declineAssignment(ctx, fixture.assignmentId, 'I advise this speaker');

    const queue = await review.loadReviewerQueue(ctx, fixture.roundId);
    expect(queue.assignments).toHaveLength(0);
    expect(queue.recused.map((row) => row.submissionId)).toEqual([fixture.submissionId]);
  });

  it('refuses to score a council that has closed', async () => {
    const fixture = await seed({ roundStatus: 'closed' });

    await expect(
      review.saveScorecard(fixture.ctx(fixture.reviewer, 'reviewer'), {
        roundId: fixture.roundId,
        submissionId: fixture.submissionId,
        scores: [{ criterionId: fixture.criteria[0].id, value: 5 }],
      }),
    ).rejects.toSatisfy((error: unknown) => message(error).includes('closed'));
  });

  it('still lets an organizer score a closed council', async () => {
    const fixture = await seed({ roundStatus: 'closed' });

    const saved = await review.saveScorecard(fixture.ctx(fixture.organizer, 'organizer'), {
      roundId: fixture.roundId,
      submissionId: fixture.submissionId,
      scores: [{ criterionId: fixture.criteria[0].id, value: 5 }],
    });

    expect(saved.aggregate.average).not.toBeNull();
  });
});

/**
 * `ABS-03`. A scorecard is not only ratings: an organizer builds a dropdown and a written question
 * too, and the answers to those have to come back off the round trip intact and stay out of the
 * weighted average.
 */
describe('criterion field types, end to end', () => {
  it('stores and reads back a rating, a dropdown choice and a written answer', async () => {
    const fixture = await seed();
    const organizer = fixture.ctx(fixture.organizer, 'organizer');
    const reviewer = fixture.ctx(fixture.reviewer, 'reviewer');
    const [relevance] = fixture.criteria;

    const recommendation = await review.addCriterion(organizer, fixture.roundId, {
      label: 'Recommendation',
      type: 'select',
      options: ['Accept', 'Maybe', 'Reject'],
    });
    const comments = await review.addCriterion(organizer, fixture.roundId, {
      label: 'Comments',
      type: 'text',
    });

    expect(recommendation.options).toEqual(['Accept', 'Maybe', 'Reject']);
    // Neither type carries weight, so neither can tilt an average.
    expect(recommendation.weight).toBe(0);
    expect(comments.weight).toBe(0);

    const saved = await review.saveScorecard(reviewer, {
      roundId: fixture.roundId,
      submissionId: fixture.submissionId,
      scores: [
        { criterionId: relevance.id, value: 4 },
        { criterionId: recommendation.id, value: null, text: 'Accept' },
        { criterionId: comments.id, value: null, text: 'Strong fit for the opening track.' },
      ],
      complete: true,
    });

    // Only Relevance was rated, and only Relevance counts: 4 of 5, renormalized, is 4.
    expect(saved.aggregate.average).toBe(4);

    const reloaded = await review.loadAssignedReview(reviewer, fixture.submissionId, fixture.roundId);
    const answer = (criterionId: string) =>
      reloaded.myScores.find((score) => score.criterionId === criterionId);

    expect(answer(relevance.id)?.value).toBe(4);
    expect(answer(recommendation.id)).toMatchObject({ value: null, text: 'Accept' });
    expect(answer(comments.id)).toMatchObject({
      value: null,
      text: 'Strong fit for the opening track.',
    });
    expect(reloaded.criteria.find((entry) => entry.id === comments.id)?.type).toBe('text');
  });

  it('refuses a choice the organizer never offered', async () => {
    const fixture = await seed();
    const organizer = fixture.ctx(fixture.organizer, 'organizer');

    const recommendation = await review.addCriterion(organizer, fixture.roundId, {
      label: 'Recommendation',
      type: 'select',
      options: ['Accept', 'Reject'],
    });

    await expect(
      review.saveScorecard(fixture.ctx(fixture.reviewer, 'reviewer'), {
        roundId: fixture.roundId,
        submissionId: fixture.submissionId,
        scores: [{ criterionId: recommendation.id, value: null, text: 'Maybe' }],
      }),
    ).rejects.toSatisfy((error: unknown) => message(error).includes('not an option'));
  });

  it('refuses a dropdown with nothing to choose between', async () => {
    const fixture = await seed();

    await expect(
      review.addCriterion(fixture.ctx(fixture.organizer, 'organizer'), fixture.roundId, {
        label: 'Recommendation',
        type: 'select',
        options: ['Accept'],
      }),
    ).rejects.toSatisfy((error: unknown) => message(error).includes('at least two options'));
  });

  it('clears answers given against the question a criterion used to be', async () => {
    const fixture = await seed();
    const organizer = fixture.ctx(fixture.organizer, 'organizer');
    const reviewer = fixture.ctx(fixture.reviewer, 'reviewer');
    const [relevance] = fixture.criteria;

    await review.saveScorecard(reviewer, {
      roundId: fixture.roundId,
      submissionId: fixture.submissionId,
      scores: [{ criterionId: relevance.id, value: 5 }],
    });
    await review.updateCriterion(organizer, relevance.id, {
      type: 'select',
      options: ['Accept', 'Reject'],
    });

    const reloaded = await review.loadAssignedReview(reviewer, fixture.submissionId, fixture.roundId);
    expect(reloaded.myScores.find((score) => score.criterionId === relevance.id)).toBeUndefined();
  });
});

describe('anonymity, enforced in SQL rather than in the view', () => {
  it('keeps the author out of what an anonymized round hands a reviewer', async () => {
    const fixture = await seed({ anonymized: true });

    const detail = await review.loadAssignedReview(
      fixture.ctx(fixture.reviewer, 'reviewer'),
      fixture.submissionId,
      fixture.roundId,
    );

    expect(detail.authorHidden).toBe(true);
    expect(detail.submitterName).not.toContain('Vitruvius');
    expect(JSON.stringify(detail.speakers)).not.toContain('Vitruvius');
    expect(JSON.stringify(detail)).not.toContain(fixture.author.email);
  });

  it('still shows the organizer who wrote it, so decisions keep a name attached', async () => {
    const fixture = await seed({ anonymized: true });

    const detail = await review.loadAssignedReview(
      fixture.ctx(fixture.organizer, 'organizer'),
      fixture.submissionId,
      fixture.roundId,
    );

    expect(detail.authorHidden).toBe(false);
    expect(detail.submitterName).toContain('Vitruvius');
  });

  it('names the author for a reviewer when the round is not anonymized', async () => {
    const fixture = await seed({ anonymized: false });

    const detail = await review.loadAssignedReview(
      fixture.ctx(fixture.reviewer, 'reviewer'),
      fixture.submissionId,
      fixture.roundId,
    );

    expect(detail.authorHidden).toBe(false);
    expect(detail.submitterName).toContain('Vitruvius');
  });
});

describe('blind until close', () => {
  async function peerScores(fixture: ReviewFixture) {
    await review.saveScorecard(fixture.ctx(fixture.peer, 'reviewer'), {
      roundId: fixture.roundId,
      submissionId: fixture.submissionId,
      scores: fixture.criteria.map((criterion) => ({ criterionId: criterion.id, value: 4 })),
      comment: 'The peer opinion',
      complete: true,
    });
  }

  const peerRow = (detail: review.SubmissionReview, fixture: ReviewFixture) =>
    detail.reviewers.find((row) => row.reviewerUserId === fixture.peer.userId);

  it("withholds a peer's scorecard entirely while the round is open", async () => {
    const fixture = await seed({ roundStatus: 'open', blindUntilClose: true });
    await peerScores(fixture);

    const detail = await review.loadAssignedReview(
      fixture.ctx(fixture.reviewer, 'reviewer'),
      fixture.submissionId,
      fixture.roundId,
    );

    // The peer row is removed rather than emptied, so there is no shape left to read a number off.
    expect(detail.blinded).toBe(true);
    expect(peerRow(detail, fixture)).toBeUndefined();
    expect(detail.reviewers.map((row) => row.reviewerUserId)).toEqual([fixture.reviewer.userId]);
    expect(JSON.stringify(detail.reviewers)).not.toContain('The peer opinion');
  });

  it("reveals a peer's scorecard once the round is closed", async () => {
    const fixture = await seed({ roundStatus: 'open', blindUntilClose: true });
    await peerScores(fixture);
    await review.updateRound(fixture.ctx(fixture.organizer, 'organizer'), fixture.roundId, {
      status: 'closed',
    });

    const detail = await review.loadAssignedReview(
      fixture.ctx(fixture.reviewer, 'reviewer'),
      fixture.submissionId,
      fixture.roundId,
    );

    expect(detail.blinded).toBe(false);
    expect(peerRow(detail, fixture)?.comment).toBe('The peer opinion');
    expect(peerRow(detail, fixture)?.scores.map((score) => score.value)).toEqual([4, 4, 4]);
  });

  it('shows peers immediately when the round was never blind', async () => {
    const fixture = await seed({ roundStatus: 'open', blindUntilClose: false });
    await peerScores(fixture);

    const detail = await review.loadAssignedReview(
      fixture.ctx(fixture.reviewer, 'reviewer'),
      fixture.submissionId,
      fixture.roundId,
    );

    expect(detail.blinded).toBe(false);
    expect(peerRow(detail, fixture)?.comment).toBe('The peer opinion');
  });
});
