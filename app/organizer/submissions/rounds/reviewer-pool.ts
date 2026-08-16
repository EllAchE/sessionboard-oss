export type ReviewerAssignmentCount = {
  reviewerUserId: string;
  assigned: number;
};

export function assignedReviewerIds(workload: ReviewerAssignmentCount[]): string[] {
  return workload
    .filter((reviewer) => reviewer.assigned > 0)
    .map((reviewer) => reviewer.reviewerUserId);
}
