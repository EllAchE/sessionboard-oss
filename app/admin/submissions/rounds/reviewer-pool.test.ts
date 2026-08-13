import { describe, expect, it } from 'vitest';
import { assignedReviewerIds } from './reviewer-pool';

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
