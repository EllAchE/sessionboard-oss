export type ReviewerAssignmentCount = {
  reviewerUserId: string;
  assigned: number;
};

export function assignedReviewerIds(workload: ReviewerAssignmentCount[]): string[] {
  return workload
    .filter((reviewer) => reviewer.assigned > 0)
    .map((reviewer) => reviewer.reviewerUserId);
}

/**
 * Who is assigned, as a value that can be compared.
 *
 * The reviewer checkboxes are seeded from `assignedReviewerIds` and then edited by hand, so the
 * seeding has to fire when the pool changes and stay out of the way otherwise. Watching the array
 * cannot tell the difference: every server render hands the screen a new `workload` array, and
 * every save on this page ends in `router.refresh()`. So adding a criterion, inviting a reviewer or
 * editing the round re-seeded the checkboxes and silently threw away a selection the organizer had
 * not yet auto-assigned.
 *
 * Reviewer ids are uuids, so joining them is unambiguous. Same idea as `coverageKey` beside it in
 * `RoundsManager` — the state is the organizer's until the server says something genuinely new.
 */
export function assignedReviewerKey(workload: ReviewerAssignmentCount[]): string {
  return assignedReviewerIds(workload).join(',');
}

/** The pool back out of the key above. */
export function reviewerPoolFromKey(key: string): string[] {
  return key ? key.split(',') : [];
}
