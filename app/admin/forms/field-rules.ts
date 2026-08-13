import {
  BUILTIN_META,
  PARTICIPANT_BUILTIN_META,
  isBuiltinKey,
  isParticipantBuiltinKey,
  type Condition,
  type ConditionOp,
  type FieldType,
  type FormFieldSpec,
} from '../../../lib/forms/contract';

/**
 * Pure rules shared by the builder UI and `lib/services/forms.ts`. It lives under `app/` rather
 * than `lib/` because `lib/**` is owned elsewhere and frozen, and because a client component may
 * not import the service — that would drag `pg` into the browser bundle. Nothing here touches
 * React, Next or the database.
 */

export type FieldTypeOption = { value: FieldType; label: string; hint: string };

export const FIELD_TYPE_OPTIONS: readonly FieldTypeOption[] = [
  { value: 'short_text', label: 'Short text', hint: 'One line' },
  { value: 'long_text', label: 'Long text', hint: 'Plain paragraph' },
  { value: 'markdown', label: 'Rich text', hint: 'Markdown, rendered' },
  { value: 'select', label: 'Dropdown', hint: 'Pick one' },
  { value: 'multi_select', label: 'Multi-select', hint: 'Pick several' },
  { value: 'radio', label: 'Radio buttons', hint: 'Pick one, all visible' },
  { value: 'checkbox', label: 'Checkbox', hint: 'Yes or no' },
  { value: 'number', label: 'Number', hint: '' },
  { value: 'email', label: 'Email', hint: '' },
  { value: 'url', label: 'URL', hint: '' },
  { value: 'date', label: 'Date', hint: '' },
  { value: 'file', label: 'File upload', hint: '' },
  { value: 'section_break', label: 'Section break', hint: 'A heading, collects nothing' },
];

export function fieldTypeLabel(type: FieldType): string {
  return FIELD_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
}

export function supportsOptions(type: FieldType): boolean {
  return type === 'select' || type === 'multi_select' || type === 'radio';
}

export function supportsLength(type: FieldType): boolean {
  return type === 'short_text' || type === 'long_text' || type === 'markdown';
}

export function collectsAnswer(type: FieldType): boolean {
  return type !== 'section_break';
}

/** Enough of a field to answer every lock question below, from either built-in namespace. */
type LockableField = Pick<FormFieldSpec, 'builtinKey'> & Partial<Pick<FormFieldSpec, 'participantKey'>>;

/** A locked builtin. Reorderable, relabelable, optional-able — never deletable or retypeable. */
export function isLockedField(field: LockableField): boolean {
  return isBuiltinKey(field.builtinKey) || isParticipantBuiltinKey(field.participantKey);
}

export function lockReason(field: LockableField): string | null {
  if (isParticipantBuiltinKey(field.participantKey)) {
    const meta = PARTICIPANT_BUILTIN_META[field.participantKey];
    return meta.requiredLocked
      ? `Built-in participant field. Its answer is stored on ${meta.column}, and it is what identifies the person, so it cannot be removed, retyped or made optional. You can rename it and reorder it.`
      : `Built-in participant field. Its answer is stored on ${meta.column}, which the roster, the speaker gallery and the reminders all read, so it cannot be removed or given a different type. You can rename it, reorder it or make it optional.`;
  }
  if (!isBuiltinKey(field.builtinKey)) return null;
  const meta = BUILTIN_META[field.builtinKey];
  return meta.column
    ? `Built-in field. Its answer is stored on submission.${meta.column}, which the review queue, agenda and embeds all read, so it cannot be removed or given a different type. You can rename it, reorder it or make it optional.`
    : 'Built-in field. Its answers are stored as real submission tags, which the review queue and embeds filter on, so it cannot be removed or given a different type. You can rename it, reorder it or make it optional.';
}

export function canDeleteField(field: LockableField): boolean {
  return !isLockedField(field);
}

export function canChangeFieldType(field: LockableField): boolean {
  return !isLockedField(field);
}

export function canChangeFieldKey(field: LockableField): boolean {
  return !isLockedField(field);
}

/**
 * `F-6`'s "(all locked)". Only three fields in the product cannot have their Required toggle turned
 * off, and all three are the participant's identity — first name, last name, email.
 */
export function canChangeRequired(field: LockableField): boolean {
  return !(
    isParticipantBuiltinKey(field.participantKey) &&
    PARTICIPANT_BUILTIN_META[field.participantKey].requiredLocked
  );
}

export function canAddOptions(field: Pick<FormFieldSpec, 'builtinKey' | 'type'>): boolean {
  // The builtin select-likes read their choices from the event's tracks, formats and tags.
  return supportsOptions(field.type) && !isLockedField(field);
}

/**
 * The dropdown the condition editor is allowed to offer. `validateConditions` rejects anything
 * else at save time; this exists so the organizer never reaches that error in the first place.
 *
 * Eligible means: earlier in the form's running order, not the field itself, not itself
 * conditional (conditions may not chain), and something a submitter actually answers.
 */
export function eligibleConditionTargets(
  fields: readonly FormFieldSpec[],
  fieldId: string | null,
): FormFieldSpec[] {
  const ordered = [...fields].sort((a, b) => a.position - b.position);
  const index = fieldId === null ? ordered.length : ordered.findIndex((f) => f.id === fieldId);
  if (index === -1) return [];
  return ordered
    .slice(0, index)
    .filter((field) => collectsAnswer(field.type) && field.showIf === null);
}

const OPS_BY_TYPE: Record<FieldType, ConditionOp[]> = {
  short_text: ['eq', 'neq', 'includes', 'is_empty', 'not_empty'],
  long_text: ['includes', 'is_empty', 'not_empty'],
  markdown: ['includes', 'is_empty', 'not_empty'],
  select: ['eq', 'neq', 'is_empty', 'not_empty'],
  multi_select: ['includes', 'is_empty', 'not_empty'],
  radio: ['eq', 'neq', 'is_empty', 'not_empty'],
  checkbox: ['eq', 'neq'],
  number: ['eq', 'neq', 'gt', 'lt', 'is_empty', 'not_empty'],
  email: ['eq', 'neq', 'includes', 'is_empty', 'not_empty'],
  url: ['includes', 'is_empty', 'not_empty'],
  date: ['eq', 'neq', 'gt', 'lt', 'is_empty', 'not_empty'],
  file: ['is_empty', 'not_empty'],
  section_break: [],
};

export function conditionOpsFor(type: FieldType): ConditionOp[] {
  return OPS_BY_TYPE[type];
}

export const CONDITION_OP_LABELS: Record<ConditionOp, string> = {
  eq: 'is',
  neq: 'is not',
  includes: 'contains',
  gt: 'is greater than',
  lt: 'is less than',
  is_empty: 'is empty',
  not_empty: 'is answered',
};

export function opNeedsValue(op: ConditionOp): boolean {
  return op !== 'is_empty' && op !== 'not_empty';
}

export function describeCondition(condition: Condition, target: FormFieldSpec | undefined): string {
  const label = target?.label ?? 'a removed question';
  const op = CONDITION_OP_LABELS[condition.op];
  return opNeedsValue(condition.op)
    ? `Shown when “${label}” ${op} “${condition.value ?? ''}”`
    : `Shown when “${label}” ${op}`;
}

/** Answer keys are what land in `submission.answers`, so they are snake_case and stable. */
export function toFieldKey(input: string): string {
  const key = input
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return key || 'field';
}

export function uniqueFieldKey(taken: readonly string[], desired: string): string {
  const base = toFieldKey(desired);
  if (!taken.includes(base)) return base;
  for (let suffix = 2; suffix < 500; suffix += 1) {
    const candidate = `${base}_${suffix}`;
    if (!taken.includes(candidate)) return candidate;
  }
  return `${base}_${Date.now()}`;
}

/** Which fields share a combined limit, and what that limit works out to (`F-15`). */
export function charLimitGroups(
  fields: readonly FormFieldSpec[],
): Array<{ group: string; fields: FormFieldSpec[]; limit: number }> {
  const groups = new Map<string, FormFieldSpec[]>();
  for (const field of fields) {
    if (!field.charLimitGroup) continue;
    const existing = groups.get(field.charLimitGroup) ?? [];
    existing.push(field);
    groups.set(field.charLimitGroup, existing);
  }
  return [...groups.entries()].map(([group, members]) => ({
    group,
    fields: members,
    limit: members.reduce((max, field) => Math.max(max, field.maxLength ?? 0), 0),
  }));
}

export function stepsOf(fields: readonly FormFieldSpec[]): number[] {
  const steps = new Set<number>([0]);
  for (const field of fields) steps.add(field.step);
  return [...steps].sort((a, b) => a - b);
}
