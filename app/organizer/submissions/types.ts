/** Wire types shared by the review server actions and the client components that call them. */

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; message: string; details?: Record<string, string> };

export type ScoreWire = { criterionId: string; value: number };

export type AiReviewWire = {
  id: string;
  model: string;
  rationaleHtml: string;
  criterionScores: Array<{ criterionId: string; value: number; note?: string }>;
  createdAt: string;
};
