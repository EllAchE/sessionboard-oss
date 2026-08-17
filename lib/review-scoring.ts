/**
 * Every average is normalised back onto this scale whatever a criterion's own max is, so it is also
 * the denominator any surface has to print beside a score for the number to mean anything.
 */
export const SCORE_SCALE = 5;

export type WeightedCriterion = { id: string; weight: number; maxScore: number };
/**
 * `value` is nullable because a scorecard also carries dropdown and free-text criteria, whose rows
 * hold no number at all. They are skipped below rather than counted as a zero.
 */
export type WeightedScore = { criterionId: string; value: number | null };

export type WeightedScoreResult = {
  average: number | null;
  fraction: number | null;
  answeredIds: string[];
  weightScored: number;
};

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function weightedScore(
  criteria: WeightedCriterion[],
  scores: WeightedScore[],
): WeightedScoreResult {
  const byId = new Map(criteria.map((criterion) => [criterion.id, criterion]));
  const answered = new Map<string, number>();

  for (const entry of scores) {
    if (!byId.has(entry.criterionId)) continue;
    if (typeof entry.value !== 'number' || !Number.isFinite(entry.value)) continue;
    answered.set(entry.criterionId, entry.value);
  }

  let weightScored = 0;
  let weighted = 0;
  for (const [criterionId, raw] of answered) {
    const criterion = byId.get(criterionId) as WeightedCriterion;
    const weight = Math.max(0, criterion.weight);
    const max = criterion.maxScore > 0 ? criterion.maxScore : SCORE_SCALE;
    const clamped = Math.max(0, Math.min(max, raw));
    weightScored += weight;
    weighted += weight * (clamped / max);
  }

  const fraction = weightScored > 0 ? weighted / weightScored : null;

  return {
    average: fraction === null ? null : round(fraction * SCORE_SCALE, 2),
    fraction: fraction === null ? null : round(fraction, 4),
    answeredIds: [...answered.keys()],
    weightScored,
  };
}
