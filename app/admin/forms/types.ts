import type { Condition, FieldType, ParticipantRoleKind } from '../../../lib/forms/contract';
import type { FormKind, FormStatus, FormTargetType } from '../../../lib/services/forms';

/**
 * The wire shapes between the builder's client components and its Server Actions. Dates cross as
 * ISO strings because a Server Action argument is serialized, and a `Date` that survives the hop in
 * development quietly does not in every runtime.
 */

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; message: string; details?: Record<string, string> };

export type FormSettingsInput = {
  name?: string;
  slug?: string;
  kind?: FormKind;
  /** `F-4` */
  targetType?: FormTargetType;
  /** `F-4` */
  collectsParticipants?: boolean;
  /** `F-9` */
  externalTitle?: string | null;
  /** `F-9` */
  pageHeading?: string | null;
  /** `F-9` */
  showWelcome?: boolean;
  /** `F-7` */
  maxParticipants?: number | null;
  introMarkdown?: string | null;
  opensAt?: string | null;
  closesAt?: string | null;
  maxSubmissionsPerUser?: number | null;
  allowDrafts?: boolean;
  notifyEmails?: string[];
  confirmationSubject?: string | null;
  confirmationBodyMarkdown?: string | null;
};

/** `F-7`: one configured role as the builder posts it back. */
export type RoleInputWire = {
  kind: ParticipantRoleKind;
  label: string;
  minCount: number;
  maxCount: number | null;
};

export type NewFieldInputWire = {
  type: FieldType;
  label: string;
  step?: number;
  helpText?: string | null;
  placeholder?: string | null;
  required?: boolean;
  options?: string[] | null;
  minLength?: number | null;
  maxLength?: number | null;
  charLimitGroup?: string | null;
  index?: number;
};

export type FieldPatchWire = {
  label?: string;
  type?: FieldType;
  helpText?: string | null;
  placeholder?: string | null;
  required?: boolean;
  options?: string[] | null;
  showIf?: Condition | null;
  minLength?: number | null;
  maxLength?: number | null;
  charLimitGroup?: string | null;
  step?: number;
};

export type { FormKind, FormStatus, FormTargetType, ParticipantRoleKind };
