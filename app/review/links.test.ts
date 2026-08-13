import { describe, expect, it } from 'vitest';
import { reviewerSubmissionHref } from './links';

describe('reviewerSubmissionHref', () => {
  it('keeps the selected round on dashboard and adjacent-submission links', () => {
    expect(reviewerSubmissionHref('submission-current', 'round-selected')).toBe(
      '/review/submission-current?round=round-selected',
    );
    expect(reviewerSubmissionHref('submission-next', 'round-selected')).toBe(
      '/review/submission-next?round=round-selected',
    );
  });

  it('keeps the legacy path when no round is available', () => {
    expect(reviewerSubmissionHref('submission-current', null)).toBe('/review/submission-current');
  });
});
