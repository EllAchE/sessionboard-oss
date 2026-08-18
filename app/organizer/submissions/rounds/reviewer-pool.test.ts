import { describe, expect, it } from 'vitest';
import { assignedReviewerIds, assignedReviewerKey, reviewerPoolFromKey } from './reviewer-pool';

describe('round reviewer pool', () => {
  it('contains only reviewers assigned in the selected round', () => {
    expect(
      assignedReviewerIds([
        { reviewerUserId: 'reviewer-in-round', assigned: 2 },
        { reviewerUserId: 'reviewer-other-round', assigned: 0 },
      ]),
    ).toEqual(['reviewer-in-round']);
  });

  it('starts empty for a round without assignments', () => {
    expect(assignedReviewerIds([{ reviewerUserId: 'event-reviewer', assigned: 0 }])).toEqual([]);
  });
});

/**
 * The checkboxes are seeded from the pool and then edited by hand, so what re-seeds them decides
 * whether an organizer's selection survives the next save. Every save on the rounds page ends in
 * `router.refresh()`, which hands the screen a fresh `workload` array holding the same reviewers —
 * so the seeding has to compare the pool, not the array carrying it.
 */
describe('round reviewer pool identity', () => {
  const workload = [
    { reviewerUserId: 'reviewer-a', assigned: 3 },
    { reviewerUserId: 'reviewer-b', assigned: 0 },
    { reviewerUserId: 'reviewer-c', assigned: 1 },
  ];

  it('is unchanged by a refresh that reports the same assignments', () => {
    // The same reviewers, in a new array, exactly as a re-render delivers them.
    const afterRefresh = workload.map((entry) => ({ ...entry }));

    expect(assignedReviewerKey(afterRefresh)).toBe(assignedReviewerKey(workload));
    expect(afterRefresh).not.toBe(workload);
  });

  it('changes when a reviewer picks up their first assignment', () => {
    const afterAutoAssign = workload.map((entry) =>
      entry.reviewerUserId === 'reviewer-b' ? { ...entry, assigned: 2 } : entry,
    );

    expect(assignedReviewerKey(afterAutoAssign)).not.toBe(assignedReviewerKey(workload));
  });

  it('changes when a reviewer loses their last assignment', () => {
    const afterUnassign = workload.map((entry) =>
      entry.reviewerUserId === 'reviewer-c' ? { ...entry, assigned: 0 } : entry,
    );

    expect(assignedReviewerKey(afterUnassign)).not.toBe(assignedReviewerKey(workload));
  });

  it('ignores a reviewer whose assignment count moved without crossing zero', () => {
    const afterTopUp = workload.map((entry) =>
      entry.reviewerUserId === 'reviewer-a' ? { ...entry, assigned: 9 } : entry,
    );

    expect(assignedReviewerKey(afterTopUp)).toBe(assignedReviewerKey(workload));
  });

  it('round-trips the pool it was built from', () => {
    expect(reviewerPoolFromKey(assignedReviewerKey(workload))).toEqual(['reviewer-a', 'reviewer-c']);
  });

  it('round-trips an empty pool as an empty list rather than one blank id', () => {
    expect(reviewerPoolFromKey(assignedReviewerKey([]))).toEqual([]);
    expect(reviewerPoolFromKey('')).toEqual([]);
  });
});
