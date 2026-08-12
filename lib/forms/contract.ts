import { invalid } from '../errors';
import { markdownLength } from '../markdown';

/**
 * The form engine's contract. `app/admin/forms/**` (the builder), `app/(public)/submit/**` (the
 * runtime) and `lib/services/forms.ts` all agree here and nowhere else.
 */

export type FieldType =
  | 'short_text'
  | 'long_text'
  | 'markdown'
  | 'select'
  | 'multi_select'
  | 'radio'
  | 'checkbox'
  | 'number'
  | 'email'
  | 'url'
  | 'date'
  | 'file'
  | 'section_break';

/**
 * The locked six. Their *values* live in real `submission` columns, never in `answers` — the review
 * queue sorts on them, the agenda joins on them, conflict detection compares them and the embeds
 * filter on them, none of which survives a JSONB round trip at speed.
 *
 * A `form_field` row still exists for each, because an organizer must be able to reorder them,
 * relabel them and mark them optional. That row carries `builtinKey`; what it does not carry is the
 * answer. This split is the reason no off-the-shelf form engine fit — see `docs/02-architecture.md`.
 */
export const BUILTIN_FIELDS = ['title', 'description', 'format', 'track', 'level', 'tags'] as const;

export type BuiltinKey = (typeof BUILTIN_FIELDS)[number];

export const BUILTIN_META: Record<
  BuiltinKey,
  { label: string; type: FieldType; required: boolean; column: string }
> = {
  title: { label: 'Title', type: 'short_text', required: true, column: 'title' },
  description: { label: 'Description', type: 'markdown', required: true, column: 'descriptionMarkdown' },
  format: { label: 'Session format', type: 'select', required: false, column: 'formatId' },
  track: { label: 'Track', type: 'select', required: false, column: 'trackId' },
  level: { label: 'Audience level', type: 'select', required: false, column: 'level' },
  /** Many-to-many through `submission_tag`, so it has no column of its own on `submission`. */
  tags: { label: 'Tags', type: 'multi_select', required: false, column: '' },
};

export function isBuiltinKey(key: string | null | undefined): key is BuiltinKey {
  return !!key && (BUILTIN_FIELDS as readonly string[]).includes(key);
}

export type ConditionOp = 'eq' | 'neq' | 'includes' | 'gt' | 'lt' | 'is_empty' | 'not_empty';

/**
 * `showIf` may reference only a field that appears EARLIER in the form, exactly one hop, with no
 * chaining. That single restriction removes cyclic conditions and cascade-ordering bugs by
 * construction rather than by careful evaluation, which is why it is a documented product limit and
 * not a gap. `validateConditions` enforces it at save time so the runtime never has to.
 */
export type Condition = {
  fieldId: string;
  op: ConditionOp;
  value?: string | number;
};

/** The shape the builder and runtime both pass around. A subset of the `form_field` row. */
export type FormFieldSpec = {
  id: string;
  key: string;
  builtinKey: BuiltinKey | null;
  type: FieldType;
  label: string;
  position: number;
  step: number;
  required: boolean;
  options: string[] | null;
  showIf: Condition | null;
  minLength: number | null;
  maxLength: number | null;
  charLimitGroup: string | null;
};

export type AnswerValue = string | number | boolean | string[] | null;
export type AnswerMap = Record<string, AnswerValue>;

function isEmpty(value: AnswerValue): boolean {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function evaluateCondition(condition: Condition, value: AnswerValue): boolean {
  switch (condition.op) {
    case 'is_empty':
      return isEmpty(value);
    case 'not_empty':
      return !isEmpty(value);
    case 'includes':
      return Array.isArray(value)
        ? value.includes(String(condition.value))
        : String(value ?? '').includes(String(condition.value));
    case 'eq':
      return String(value ?? '') === String(condition.value ?? '');
    case 'neq':
      return String(value ?? '') !== String(condition.value ?? '');
    case 'gt':
      return Number(value) > Number(condition.value);
    case 'lt':
      return Number(value) < Number(condition.value);
  }
}

/**
 * Whether a field is currently on screen. Because conditions are one hop, this is a direct lookup
 * against the referenced field's own answer — never a recursive walk, and never dependent on
 * whether the referenced field is itself visible.
 */
export function isFieldVisible(field: FormFieldSpec, values: AnswerMap, byId: Map<string, FormFieldSpec>): boolean {
  if (!field.showIf) return true;
  const target = byId.get(field.showIf.fieldId);
  if (!target) return true;
  return evaluateCondition(field.showIf, values[target.key] ?? null);
}

export function visibleFields(fields: FormFieldSpec[], values: AnswerMap): FormFieldSpec[] {
  const byId = new Map(fields.map((field) => [field.id, field]));
  return fields.filter((field) => isFieldVisible(field, values, byId));
}

/** Save-time enforcement of the one-hop rule. The builder calls this before it will publish. */
export function validateConditions(fields: FormFieldSpec[]): void {
  const ordered = [...fields].sort((a, b) => a.position - b.position);
  const seen = new Set<string>();
  for (const field of ordered) {
    if (field.showIf) {
      const target = field.showIf.fieldId;
      if (target === field.id) {
        throw invalid(`"${field.label}" cannot depend on itself`);
      }
      if (!seen.has(target)) {
        throw invalid(`"${field.label}" can only depend on a question that comes before it`);
      }
      const targetField = ordered.find((f) => f.id === target);
      if (targetField?.showIf) {
        throw invalid(
          `"${field.label}" depends on "${targetField.label}", which is itself conditional. Conditions cannot chain.`,
        );
      }
    }
    seen.add(field.id);
  }
}

/**
 * Values for fields the submitter never saw are dropped, not persisted. Keeping them would mean an
 * answer to a question that was not asked can still gate a decision, show up in an export, or
 * reappear if the condition later flips.
 */
export function clearHiddenAnswers(fields: FormFieldSpec[], values: AnswerMap): AnswerMap {
  const visible = new Set(visibleFields(fields, values).map((field) => field.key));
  return Object.fromEntries(Object.entries(values).filter(([key]) => visible.has(key)));
}

export type SplitAnswers = {
  /** Destined for real `submission` columns, keyed by builtin. */
  builtins: Partial<Record<BuiltinKey, AnswerValue>>;
  /** Everything else, destined for `submission.answers` JSONB. */
  answers: AnswerMap;
};

export function splitAnswers(fields: FormFieldSpec[], values: AnswerMap): SplitAnswers {
  const builtins: Partial<Record<BuiltinKey, AnswerValue>> = {};
  const answers: AnswerMap = {};
  for (const field of fields) {
    if (field.type === 'section_break') continue;
    const value = values[field.key] ?? null;
    if (field.builtinKey) builtins[field.builtinKey] = value;
    else answers[field.key] = value;
  }
  return { builtins, answers };
}

/**
 * `F-15`: fields sharing a `charLimitGroup` are counted together against one limit, so an organizer
 * can say "abstract plus bio, 500 characters total". Length is measured on rendered text, because a
 * submitter budgets against what a reader sees rather than against their markdown syntax.
 */
export function validateAnswers(fields: FormFieldSpec[], values: AnswerMap): void {
  const shown = visibleFields(fields, values);
  const errors: Record<string, string> = {};
  const groupTotals = new Map<string, { used: number; limit: number }>();

  for (const field of shown) {
    if (field.type === 'section_break') continue;
    const value = values[field.key] ?? null;

    if (field.required && isEmpty(value)) {
      errors[field.key] = `${field.label} is required`;
      continue;
    }
    if (isEmpty(value)) continue;

    const length = typeof value === 'string' ? markdownLength(value) : 0;
    if (field.minLength && length < field.minLength) {
      errors[field.key] = `${field.label} must be at least ${field.minLength} characters`;
    }
    if (field.maxLength && length > field.maxLength) {
      errors[field.key] = `${field.label} must be at most ${field.maxLength} characters`;
    }
    if (field.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value))) {
      errors[field.key] = `${field.label} must be a valid email address`;
    }
    if (field.type === 'number' && Number.isNaN(Number(value))) {
      errors[field.key] = `${field.label} must be a number`;
    }
    if (field.options && (field.type === 'select' || field.type === 'radio')) {
      if (!field.options.includes(String(value))) {
        errors[field.key] = `${field.label} is not one of the available choices`;
      }
    }

    if (field.charLimitGroup && field.maxLength) {
      const current = groupTotals.get(field.charLimitGroup) ?? { used: 0, limit: 0 };
      groupTotals.set(field.charLimitGroup, {
        used: current.used + length,
        limit: Math.max(current.limit, field.maxLength),
      });
    }
  }

  for (const [group, { used, limit }] of groupTotals) {
    if (used > limit) {
      errors[group] = `These answers total ${used} characters, over the combined limit of ${limit}`;
    }
  }

  if (Object.keys(errors).length > 0) {
    throw invalid('Some answers need attention', errors);
  }
}

/** Live counter for the runtime, so `F-15` shows remaining characters as the submitter types. */
export function charLimitUsage(
  fields: FormFieldSpec[],
  values: AnswerMap,
  group: string,
): { used: number; limit: number } {
  let used = 0;
  let limit = 0;
  for (const field of fields) {
    if (field.charLimitGroup !== group) continue;
    limit = Math.max(limit, field.maxLength ?? 0);
    const value = values[field.key];
    if (typeof value === 'string') used += markdownLength(value);
  }
  return { used, limit };
}
