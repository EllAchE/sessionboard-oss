import type { AnswerMap, ParticipantInput, ParticipantRoleSpec } from '@/lib/forms/contract';
import type { ParticipantField, RuntimeField } from '@/lib/services/submissions';

/** Shapes and paths shared by the server page, the Server Action and the client island. */

export type SubmitPayload = {
  eventSlug: string;
  formSlug: string;
  mode: 'draft' | 'submit';
  values: AnswerMap;
  submitterName: string;
  submitterEmail: string;
  /** `F-6` / `F-7`. Empty when the form has the participant block switched off. */
  participants: ParticipantInput[];
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
  /** `F-9`: the external title. The internal name never reaches the public page. */
  formName: string;
  /** `F-9`: at most 15 characters, shown above the title on the welcome stage. */
  pageHeading: string | null;
  /** `F-9`: the welcome copy, already rendered. Null when the organizer has it hidden. */
  welcomeHtml: string | null;
  fields: RuntimeField[];
  /** `F-6` */
  participantFields: ParticipantField[];
  /** `F-7` */
  roles: ParticipantRoleSpec[];
  /** `F-4`: false removes the participant stage entirely. */
  collectsParticipants: boolean;
  /** `F-7` */
  maxParticipants: number | null;
  /** `F-4`: a session-target form enters the programme rather than proposing to it. */
  targetType: 'abstract' | 'session';
  allowDrafts: boolean;
  closesAt: string | null;
  remaining: number | null;
  maxSubmissionsPerUser: number | null;
};

/**
 * `P-2`'s five stages. Declared here rather than inside the client island so the machine can be
 * tested without a renderer — the stage list is the part of this flow that has actually been wrong.
 */
export type SubmitStep =
  | { kind: 'welcome' }
  | { kind: 'account' }
  | { kind: 'fields'; step: number }
  | { kind: 'participant' }
  | { kind: 'review' };

/**
 * Welcome → Account → Submission → Participant → Review, minus the stages this particular visit has
 * no business showing:
 *
 *   * Welcome is dropped when the organizer has both the copy and the heading empty or hidden
 *     (`F-9`) — a stage with nothing on it is worse than no stage.
 *   * Account is dropped for a submitter who is already signed in. That is correct, and it is why
 *     the stepper is derived rather than a fixed list of five: it has to say "step 2 of 4" and mean it.
 *   * Participant is dropped when the form has the block switched off (`F-4`).
 *
 * Submission always contributes at least one stage, even for a form whose every question is
 * conditionally hidden, so a submitter is never dropped straight from Welcome into Review.
 */
export function buildSteps(input: {
  showWelcome: boolean;
  signedIn: boolean;
  fieldSteps: number[];
  collectsParticipants: boolean;
}): SubmitStep[] {
  const fieldSteps = input.fieldSteps.length > 0 ? input.fieldSteps : [0];
  return [
    ...(input.showWelcome ? ([{ kind: 'welcome' }] as SubmitStep[]) : []),
    ...(input.signedIn ? [] : ([{ kind: 'account' }] as SubmitStep[])),
    ...fieldSteps.map((step) => ({ kind: 'fields', step }) as SubmitStep),
    ...(input.collectsParticipants ? ([{ kind: 'participant' }] as SubmitStep[]) : []),
    { kind: 'review' } as SubmitStep,
  ];
}

export function submitFormStateKey(submissionId: string | null): string {
  return submissionId ? `draft:${submissionId}` : 'new';
}

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
