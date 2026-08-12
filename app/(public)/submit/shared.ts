import type { AnswerMap } from '@/lib/forms/contract';
import type { RuntimeField } from '@/lib/services/submissions';

/** Shapes and paths shared by the server page, the Server Action and the client island. */

export type SubmitPayload = {
  eventSlug: string;
  formSlug: string;
  mode: 'draft' | 'submit';
  values: AnswerMap;
  submitterName: string;
  submitterEmail: string;
  submissionId: string | null;
};

export type SubmitResult =
  | { ok: true; mode: 'submit'; redirectTo: string }
  | { ok: true; mode: 'draft'; submissionId: string; displayRef: string }
  | { ok: false; message: string; errors: Record<string, string> };

export type RuntimeForm = {
  eventSlug: string;
  eventName: string;
  formSlug: string;
  formName: string;
  fields: RuntimeField[];
  allowDrafts: boolean;
  closesAt: string | null;
  remaining: number | null;
  maxSubmissionsPerUser: number | null;
};

export function submitPath(eventSlug: string, formSlug: string): string {
  return `/submit/${eventSlug}/${formSlug}`;
}

export function donePath(eventSlug: string, formSlug: string): string {
  return `${submitPath(eventSlug, formSlug)}/done`;
}

export function uploadPath(eventSlug: string, formSlug: string): string {
  return `${submitPath(eventSlug, formSlug)}/upload`;
}

/**
 * Where a submitter lands once the account exists. The portal is another workstream's surface; this
 * is the single place the runtime names it, so a different shape there is a one-line change here.
 */
export function portalPath(eventSlug: string): string {
  return `/portal/${eventSlug}`;
}
