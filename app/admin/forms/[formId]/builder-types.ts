import type { FieldType, FormFieldSpec } from '../../../../lib/forms/contract';
import type { FormKind, FormStatus } from '../types';

/**
 * What the server page hands the client builder. Declared here rather than reused from
 * `lib/services/forms.ts` so nothing in the client tree has a value import into the service, and so
 * every `Date` has already become an ISO string before it crosses the boundary.
 */

export type BuilderFieldView = FormFieldSpec & {
  helpText: string | null;
  placeholder: string | null;
  libraryEntryId: string | null;
};

export type FormView = {
  id: string;
  name: string;
  slug: string;
  kind: FormKind;
  status: FormStatus;
  introMarkdown: string | null;
  opensAt: string | null;
  closesAt: string | null;
  maxSubmissionsPerUser: number | null;
  allowDrafts: boolean;
  notifyEmails: string[];
  confirmationSubject: string | null;
  confirmationBodyMarkdown: string | null;
};

export type LibraryEntryView = {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  helpText: string | null;
  options: string[] | null;
};

/** What a palette drag carries, and what a sortable field card carries, in `active.data.current`. */
export type PaletteDragData = { source: 'palette'; type: FieldType };
export type LibraryDragData = { source: 'library'; entryId: string };
export type FieldDragData = { source: 'field'; fieldId: string; step: number };
export type BuilderDragData = PaletteDragData | LibraryDragData | FieldDragData;

export const STEP_DROPPABLE_PREFIX = 'step:';

export function stepDroppableId(step: number): string {
  return `${STEP_DROPPABLE_PREFIX}${step}`;
}

export function parseStepDroppableId(id: string): number | null {
  if (!id.startsWith(STEP_DROPPABLE_PREFIX)) return null;
  const step = Number(id.slice(STEP_DROPPABLE_PREFIX.length));
  return Number.isFinite(step) ? step : null;
}
