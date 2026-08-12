import type { Condition, FieldType } from '../../../lib/forms/contract';
import type { FormKind, FormStatus } from '../../../lib/services/forms';

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
  introMarkdown?: string | null;
  opensAt?: string | null;
  closesAt?: string | null;
  maxSubmissionsPerUser?: number | null;
  allowDrafts?: boolean;
  notifyEmails?: string[];
  confirmationSubject?: string | null;
  confirmationBodyMarkdown?: string | null;
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

export type { FormKind, FormStatus };
