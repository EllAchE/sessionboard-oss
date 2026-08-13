export function reviewerSubmissionHref(submissionId: string, roundId: string | null): string {
  const path = `/review/${encodeURIComponent(submissionId)}`;
  return roundId ? `${path}?round=${encodeURIComponent(roundId)}` : path;
}
