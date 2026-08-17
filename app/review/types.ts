/** Wire types shared by the reviewer surface's client components and its Server Actions. */

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; message: string };

/** One answer. `value` for a numeric criterion, `text` for a dropdown choice or a written one. */
export type ScoreWire = { criterionId: string; value: number | null; text?: string | null };

export type AssignmentWire = {
  assignmentId: string;
  submissionId: string;
  displayRef: string;
  title: string;
  trackName: string | null;
  formatName: string | null;
  level: string | null;
  status: 'pending' | 'completed' | 'declined';
  comment: string | null;
  submitterName: string;
  average: number | null;
};

export type CriterionWire = {
  id: string;
  label: string;
  description: string | null;
  /** `ABS-03`: which control the reviewer is shown for this line of the scorecard. */
  type: 'numeric' | 'select' | 'text';
  /** The choices for a `select` criterion; empty for the others. */
  options: string[];
  weight: number;
  maxScore: number;
};

export type RoundWire = {
  id: string;
  name: string;
  status: 'draft' | 'open' | 'closed';
  blindUntilClose: boolean;
  anonymized: boolean;
};
