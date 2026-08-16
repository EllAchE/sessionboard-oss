import { invalid } from '../errors';
import { markdownLength } from '../markdown';

/**
 * The form engine's contract. `app/organizer/forms/**` (the builder), `app/(public)/submit/**` (the
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

/**
 * `F-5` names both the starred fields and the two character caps, and both are constants rather than
 * suggestions.
 *
 * `required` is the value a freshly created form starts with — Title, Description, Format, Tags and
 * Track starred, Level the only optional one. An organizer can still turn any of them off afterwards;
 * what the constant fixes is where they start.
 *
 * `maxLength` is stronger. It is both the default written onto a new form's field and the ceiling
 * `updateField` clamps to, because the 255-character Title is what the rest of the product is built
 * around — the review queue's column, the agenda card, the `.ics` summary and the embeds all assume
 * it — and an organizer who raises it to 4,000 does not discover the consequence until a programme is
 * being laid out.
 */
export const BUILTIN_META: Record<
  BuiltinKey,
  { label: string; type: FieldType; required: boolean; column: string; maxLength: number | null }
> = {
  title: { label: 'Title', type: 'short_text', required: true, column: 'title', maxLength: 255 },
  description: {
    label: 'Description',
    type: 'markdown',
    required: true,
    column: 'descriptionMarkdown',
    maxLength: 5000,
  },
  format: {
    label: 'Session format',
    type: 'select',
    required: true,
    column: 'formatId',
    maxLength: null,
  },
  track: { label: 'Track', type: 'select', required: true, column: 'trackId', maxLength: null },
  level: { label: 'Audience level', type: 'select', required: false, column: 'level', maxLength: null },
  /** Many-to-many through `submission_tag`, so it has no column of its own on `submission`. */
  tags: { label: 'Tags', type: 'multi_select', required: true, column: '', maxLength: null },
};

export function isBuiltinKey(key: string | null | undefined): key is BuiltinKey {
  return !!key && (BUILTIN_FIELDS as readonly string[]).includes(key);
}

/**
 * `F-6`. Which entity a question is about. `builtinKey` means nothing without it: `title` belongs to
 * the abstract and `firstName` belongs to the person, and only this tells the two namespaces apart.
 */
export type FieldEntity = 'abstract' | 'participant';

export const PARTICIPANT_BUILTIN_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'biography',
] as const;

export type ParticipantBuiltinKey = (typeof PARTICIPANT_BUILTIN_FIELDS)[number];

/**
 * `F-6`'s field set. Like the abstract built-ins these answers land in real columns rather than in
 * `answers` — `user.first_name`, `user.last_name`, `user.email`, `user.phone` and
 * `participant.bio_markdown` — because sign-in, the SMS path, the roster and the speaker gallery all
 * read them directly.
 *
 * `requiredLocked` is what the brief means by "(all locked)": First Name, Last Name and Email cannot
 * be made optional, because a participant missing all three is a row nobody can contact or print.
 * Mobile Phone and Biography carry ordinary Required toggles.
 */
export const PARTICIPANT_BUILTIN_META: Record<
  ParticipantBuiltinKey,
  {
    label: string;
    type: FieldType;
    required: boolean;
    requiredLocked: boolean;
    maxLength: number | null;
    column: string;
  }
> = {
  firstName: {
    label: 'First name',
    type: 'short_text',
    required: true,
    requiredLocked: true,
    maxLength: 120,
    column: 'user.firstName',
  },
  lastName: {
    label: 'Last name',
    type: 'short_text',
    required: true,
    requiredLocked: true,
    maxLength: 120,
    column: 'user.lastName',
  },
  email: {
    label: 'Email',
    type: 'email',
    required: true,
    requiredLocked: true,
    maxLength: 320,
    column: 'user.email',
  },
  phone: {
    label: 'Mobile phone',
    type: 'short_text',
    required: false,
    requiredLocked: false,
    maxLength: 40,
    column: 'user.phone',
  },
  biography: {
    label: 'Biography',
    type: 'markdown',
    required: false,
    requiredLocked: false,
    maxLength: 5000,
    column: 'participant.bioMarkdown',
  },
};

export function isParticipantBuiltinKey(
  key: string | null | undefined,
): key is ParticipantBuiltinKey {
  return !!key && (PARTICIPANT_BUILTIN_FIELDS as readonly string[]).includes(key);
}

/** The ceiling the engine will not let a built-in exceed, whichever entity it belongs to. */
export function builtinMaxLength(
  entity: FieldEntity,
  builtinKey: string | null | undefined,
): number | null {
  if (entity === 'participant') {
    return isParticipantBuiltinKey(builtinKey)
      ? PARTICIPANT_BUILTIN_META[builtinKey].maxLength
      : null;
  }
  return isBuiltinKey(builtinKey) ? BUILTIN_META[builtinKey].maxLength : null;
}

/** `F-9`: the brief caps the welcome screen's page heading at 15 characters. */
export const PAGE_HEADING_MAX_LENGTH = 15;

/**
 * `F-9` stars three things — Internal Form Name, External Form Title, Page Heading — and the welcome
 * screen they configure is a surface of the public submit flow, which only ever serves a `cfp` form.
 * A portal form is reached through a task assignment and renders none of the three, so requiring
 * copy for a screen it does not have would be a rule with no reader.
 *
 * The kind arrives as a plain string because this file is the contract the builder, the runtime and
 * the service share, and none of them should have to import a Drizzle enum to ask the question.
 */
export function hasWelcomeScreen(kind: string): boolean {
  return kind === 'cfp';
}

/**
 * The whole of `F-9`'s welcome-screen rule, in one place so the builder can grey out Save for the
 * same reason the service refuses the write and the publish gate refuses to open the form.
 *
 * Both starred fields are required whatever `showWelcome` says. That switch is documented as hiding
 * the welcome step *while keeping the copy* — "getting it back is this switch, not rewriting the
 * paragraph" — so copy that has to survive being hidden has to exist in the first place. A rule that
 * lapsed when the toggle went off would mean turning it back on could reveal a blank screen.
 */
export function welcomeScreenErrors(input: {
  externalTitle?: string | null;
  pageHeading?: string | null;
}): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!input.externalTitle?.trim()) {
    errors.externalTitle = 'Speakers see this at the top of the page, so it cannot be blank';
  }

  const heading = input.pageHeading?.trim() ?? '';
  if (!heading) {
    errors.pageHeading = 'The welcome step needs a heading';
  } else if (heading.length > PAGE_HEADING_MAX_LENGTH) {
    errors.pageHeading = `${heading.length} characters — the limit is ${PAGE_HEADING_MAX_LENGTH}`;
  }

  return errors;
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
  /** Only ever an abstract built-in. A participant field carries `participantKey` instead. */
  builtinKey: BuiltinKey | null;
  /**
   * Optional because the overwhelming majority of this type's uses are abstract questions and always
   * were — the portal's task forms, the CSV exporter, the condition editor. Absent means `abstract`,
   * which keeps `F-6` from turning into a rename across five workstreams' files.
   */
  entity?: FieldEntity;
  participantKey?: ParticipantBuiltinKey | null;
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

// ---------------------------------------------------------------------------
// `F-7` — participant roles and counts
// ---------------------------------------------------------------------------

export type ParticipantRoleKind = 'speaker' | 'co_speaker' | 'moderator' | 'panelist';

export const PARTICIPANT_ROLE_KINDS = [
  'speaker',
  'co_speaker',
  'moderator',
  'panelist',
] as const satisfies readonly ParticipantRoleKind[];

/** The names a form starts with. An organizer relabels them per form; the `kind` underneath is fixed. */
export const PARTICIPANT_ROLE_DEFAULT_LABELS: Record<ParticipantRoleKind, string> = {
  speaker: 'Speaker',
  co_speaker: 'Co-speaker',
  moderator: 'Moderator',
  panelist: 'Panelist',
};

/** One configured role on one form. The shape the builder, the runtime and the guard all share. */
export type ParticipantRoleSpec = {
  id: string;
  kind: ParticipantRoleKind;
  label: string;
  position: number;
  minCount: number;
  maxCount: number | null;
};

export function isParticipantRoleKind(value: string): value is ParticipantRoleKind {
  return (PARTICIPANT_ROLE_KINDS as readonly string[]).includes(value);
}

/**
 * One person on a submission, as the participant stage collects them. It lives in the contract rather
 * than in the service because the client island renders this shape and the service persists it, and a
 * client component that value-imports a service drags `pg` — and, through the agenda, a mail
 * transport — into the browser bundle.
 */
export type ParticipantInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  biography?: string | null;
  role: ParticipantRoleKind;
};

export function emptyParticipant(role: ParticipantRoleKind): ParticipantInput {
  return { firstName: '', lastName: '', email: '', phone: '', biography: '', role };
}

/** The engine's `AnswerMap` view of one person, so `validateAnswers` can do the work unchanged. */
export function participantValues(person: ParticipantInput): AnswerMap {
  return {
    firstName: person.firstName ?? '',
    lastName: person.lastName ?? '',
    email: person.email ?? '',
    phone: person.phone ?? '',
    biography: person.biography ?? '',
  };
}

/**
 * `F-7` at *configuration* time. A form whose minimums already exceed its overall cap can never be
 * submitted by anybody, and the organizer should learn that while editing rather than from a speaker
 * who cannot get past the participant stage.
 */
export function validateRoleConfiguration(
  roles: ParticipantRoleSpec[],
  maxParticipants: number | null,
): void {
  const errors: Record<string, string> = {};

  for (const role of roles) {
    if (role.minCount < 0) errors[role.kind] = `${role.label}: a minimum cannot be negative`;
    if (role.maxCount !== null && role.maxCount < 1) {
      errors[role.kind] = `${role.label}: a maximum has to be at least 1, or blank for no limit`;
    }
    if (role.maxCount !== null && role.minCount > role.maxCount) {
      errors[role.kind] = `${role.label}: the minimum of ${role.minCount} is above the maximum of ${role.maxCount}`;
    }
    if (maxParticipants !== null && role.minCount > maxParticipants) {
      errors[role.kind] = `${role.label} alone requires ${role.minCount}, which is over the overall cap of ${maxParticipants}`;
    }
  }

  const floor = roles.reduce((total, role) => total + role.minCount, 0);
  if (maxParticipants !== null && floor > maxParticipants) {
    errors.maxParticipants = `These minimums require ${floor} people, over the overall cap of ${maxParticipants}`;
  }
  if (maxParticipants !== null && maxParticipants < 1) {
    errors.maxParticipants = 'An overall cap has to be at least 1, or blank for no cap';
  }

  if (Object.keys(errors).length > 0) {
    throw invalid('These participant limits cannot all be satisfied at once', errors);
  }
}

/**
 * `F-7` at *use* time — the one function both the public submit path and the portal's share path call,
 * so the two cannot disagree about whether a fourth panelist is allowed. Configuration without this
 * is decoration.
 *
 * `assigned` is one role kind per person already on, or about to be on, the submission.
 */
export function validateParticipantCounts(
  roles: ParticipantRoleSpec[],
  assigned: ParticipantRoleKind[],
  maxParticipants: number | null,
  /**
   * `ceilings` skips the minimums. It is what the portal's share flow wants: a share can only ever
   * add somebody, so a submission that already met the form still does, and one that did not is not
   * made worse — telling a speaker "this form needs a speaker" while they are adding a panelist is a
   * true statement about a problem they did not cause and cannot fix from that screen.
   */
  mode: 'all' | 'ceilings' = 'all',
): void {
  const errors: Record<string, string> = {};
  const byKind = new Map(roles.map((role) => [role.kind, role]));

  if (maxParticipants !== null && assigned.length > maxParticipants) {
    errors.participants = `This form takes at most ${maxParticipants} ${maxParticipants === 1 ? 'person' : 'people'} per submission`;
  }

  const tally = new Map<ParticipantRoleKind, number>();
  for (const kind of assigned) tally.set(kind, (tally.get(kind) ?? 0) + 1);

  for (const [kind, used] of tally) {
    const role = byKind.get(kind);
    if (!role) {
      errors.participants = 'One of these people has a role this form does not offer';
      continue;
    }
    if (role.maxCount !== null && used > role.maxCount) {
      errors[role.kind] =
        role.maxCount === 1
          ? `Only one person can be the ${role.label.toLowerCase()}`
          : `At most ${role.maxCount} people can be ${role.label.toLowerCase()}`;
    }
  }

  for (const role of roles) {
    if (mode === 'ceilings') break;
    const used = tally.get(role.kind) ?? 0;
    if (used < role.minCount) {
      errors[role.kind] =
        role.minCount === 1
          ? `This form needs a ${role.label.toLowerCase()}`
          : `This form needs at least ${role.minCount} people as ${role.label.toLowerCase()}`;
    }
  }

  // The headline is the most specific thing that went wrong rather than a summary of all of it — a
  // submitter reading "the people do not match what the form asks for" has to go looking for which
  // person and which rule, and the answer is already in hand.
  const [headline] = Object.values(errors);
  if (headline) throw invalid(errors.participants ?? headline, errors);
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
