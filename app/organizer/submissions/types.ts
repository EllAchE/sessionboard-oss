/** Wire types shared by the review server actions and the client components that call them. */

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; message: string; details?: Record<string, string> };

/** One answer. `value` for a numeric criterion, `text` for a dropdown choice or a written one. */
export type ScoreWire = { criterionId: string; value: number | null; text?: string | null };

export type AiReviewWire = {
  id: string;
  model: string;
  rationaleHtml: string;
  criterionScores: Array<{ criterionId: string; value: number; note?: string }>;
  createdAt: string;
};
