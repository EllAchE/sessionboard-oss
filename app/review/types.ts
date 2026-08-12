/** Wire types shared by the reviewer surface's client components and its Server Actions. */

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; message: string };

export type ScoreWire = { criterionId: string; value: number };

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
