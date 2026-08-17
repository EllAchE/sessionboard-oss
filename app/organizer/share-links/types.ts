import type { ShareLinkView } from '@/lib/share-link-views';

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; message: string; details?: Record<string, string> };

/** Dates crossing the server/client boundary as ISO strings, matching the integrations screen. */
export type ShareLinkRow = {
  id: string;
  label: string;
  view: ShareLinkView;
  prefix: string;
  expiresAt: string;
  revokedAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
  createdAt: string;
};

/**
 * The only time a share URL exists outside the recipient's browser. It is returned by the create
 * action, held in component state, and never fetched again — `ShareLinkRow` has no field for it.
 */
export type IssuedShareLinkRow = {
  id: string;
  label: string;
  url: string;
  expiresAt: string;
};
