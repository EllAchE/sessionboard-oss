/** Wire types shared by the speaker server actions and the client components that call them. */

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; message: string; details?: Record<string, string> };
