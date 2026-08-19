import { and, asc, count, eq, ne } from 'drizzle-orm';
import { getDb } from '../../db/client';
import {
  fieldLibraryEntry,
  form,
  formField,
  formParticipantRole,
  sessionFormat,
  submission,
  tag,
  track,
} from '../../db/schema';
import {
  canChangeFieldType,
  canChangeRequired,
  canDeleteField,
  collectsAnswer,
  eligibleConditionTargets,
  supportsOptions,
  uniqueFieldKey,
} from '../../app/organizer/forms/field-rules';
import { requireCapability } from '../context';
import type { EventContext } from '../context';
import { conflict, invalid, notFound } from '../errors';
import {
  BUILTIN_FIELDS,
  BUILTIN_META,
  PAGE_HEADING_MAX_LENGTH,
  PARTICIPANT_BUILTIN_FIELDS,
  PARTICIPANT_BUILTIN_META,
  PARTICIPANT_ROLE_DEFAULT_LABELS,
  builtinMaxLength,
  hasWelcomeScreen,
  isBuiltinKey,
  isParticipantBuiltinKey,
  isParticipantRoleKind,
  resolveFieldType,
  validateConditions,
  validateParticipantCounts,
  validateRoleConfiguration,
  welcomeScreenErrors,
  type BuiltinKey,
  type Condition,
  type FieldEntity,
  type FieldType,
  type FormFieldSpec,
  type ParticipantBuiltinKey,
  type ParticipantRoleKind,
  type ParticipantRoleSpec,
} from '../forms/contract';
import { slugify } from '../ids';

/**
 * Form CRUD, field CRUD and the publish gate. Pure TypeScript: the builder's Server Actions and the
 * public runtime both call in here, and neither the rules nor the locking live anywhere else.
 */

export type FormRecord = typeof form.$inferSelect;
export type FormKind = FormRecord['kind'];
/**
 * `F-4`: `abstract` or `session` — what a *submission* to this form becomes, a proposal bound for
 * review or an entry bound straight for the programme.
 *
 * It is not, and deliberately does not become, `S-17`'s Contacts / Groups / Submissions triple.
 * Those three are a property of the *attachment*, not of the form: a portal form has no address of
 * its own and reaches a speaker only through a task, so "who owes one of these" is settled by
 * `task.scope` (`S-16`) at the moment the form is attached — see `app/organizer/tasks/TaskEditor.tsx`.
 * Declaring it a second time here would buy nothing and cost two things. It would make a form
 * single-use where it is currently reusable, so the same "Travel and logistics" form could not be
 * per-contact on one event and per-session on the next; and it would let a form say `contacts` while
 * the task it is attached to says `submission`, a disagreement with no correct resolution, only a
 * silent override or an error class that exists because two columns answer one question.
 */
export type FormTargetType = FormRecord['targetType'];
export type FormStatus = FormRecord['status'];
export type FieldLibraryEntry = typeof fieldLibraryEntry.$inferSelect;

/** `FormFieldSpec` plus the columns only the builder cares about, with both keys resolved. */
export type BuilderField = FormFieldSpec & {
  entity: FieldEntity;
  participantKey: ParticipantBuiltinKey | null;
  helpText: string | null;
  placeholder: string | null;
  libraryEntryId: string | null;
};

export type FormSummary = FormRecord & {
  fieldCount: number;
  submissionCount: number;
};

export type FormDetail = {
  form: FormRecord;
  /** `F-5`. The abstract questions, in running order. */
  fields: BuilderField[];
  /** `F-6`. The participant questions, in their own running order. */
  participantFields: BuilderField[];
  /** `F-7`. */
  roles: ParticipantRoleSpec[];
};

type FieldRow = typeof formField.$inferSelect;

function toBuilderField(row: FieldRow): BuilderField {
  const entity: FieldEntity = row.entity;
  const builtinKey = entity === 'abstract' && isBuiltinKey(row.builtinKey) ? row.builtinKey : null;
  const participantKey =
    entity === 'participant' && isParticipantBuiltinKey(row.builtinKey) ? row.builtinKey : null;
  return {
    id: row.id,
    key: row.key,
    entity,
    builtinKey,
    participantKey,
    /**
     * Resolved rather than read straight off the row, because a built-in's type is the contract's to
     * decide and the builder is where the organizer is told what the field is. Reading the column
     * here let the type picker say "Radio buttons" and the live preview draw radios for a field the
     * public form served as a dropdown — the same question, two answers, and only the speaker saw
     * the real one.
     */
    type: resolveFieldType({ entity, builtinKey, participantKey, type: row.type }),
    label: row.label,
    position: row.position,
    step: row.step,
    required: row.required,
    options: row.options ?? null,
    showIf: row.showIf ?? null,
    minLength: row.minLength,
    maxLength: row.maxLength,
    charLimitGroup: row.charLimitGroup,
    helpText: row.helpText,
    placeholder: row.placeholder,
    libraryEntryId: row.libraryEntryId,
  };
}

function toRoleSpec(row: typeof formParticipantRole.$inferSelect): ParticipantRoleSpec {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    position: row.position,
    minCount: row.minCount,
    maxCount: row.maxCount,
  };
}

async function loadForm(ctx: EventContext, formId: string): Promise<FormRecord> {
  const row = await getDb().query.form.findFirst({
    where: and(eq(form.id, formId), eq(form.eventId, ctx.eventId)),
  });
  if (!row) throw notFound('That form');
  return row;
}

/**
 * The abstract questions only. Every existing caller means these — the runtime's field renderer, the
 * condition validator, the CSV column set — and none of them wants a person's surname in the middle
 * of the running order.
 */
async function loadFields(formId: string): Promise<BuilderField[]> {
  const rows = await getDb().query.formField.findMany({
    where: and(eq(formField.formId, formId), eq(formField.entity, 'abstract')),
    orderBy: [asc(formField.position)],
  });
  return rows.map(toBuilderField);
}

async function loadParticipantFields(formId: string): Promise<BuilderField[]> {
  const rows = await getDb().query.formField.findMany({
    where: and(eq(formField.formId, formId), eq(formField.entity, 'participant')),
    orderBy: [asc(formField.position)],
  });
  return rows.map(toBuilderField);
}

/** Both entities at once. Only the places that care about per-form uniqueness need this. */
async function loadAllFields(formId: string): Promise<BuilderField[]> {
  const rows = await getDb().query.formField.findMany({
    where: eq(formField.formId, formId),
    orderBy: [asc(formField.position)],
  });
  return rows.map(toBuilderField);
}

export async function loadFormRoles(formId: string): Promise<ParticipantRoleSpec[]> {
  const rows = await getDb().query.formParticipantRole.findMany({
    where: eq(formParticipantRole.formId, formId),
    orderBy: [asc(formParticipantRole.position)],
  });
  return rows.map(toRoleSpec);
}

async function uniqueFormSlug(eventId: string, desired: string, exceptFormId?: string): Promise<string> {
  const rows = await getDb().query.form.findMany({ where: eq(form.eventId, eventId) });
  const taken = rows.filter((row) => row.id !== exceptFormId).map((row) => row.slug);
  const base = slugify(desired) || 'form';
  if (!taken.includes(base)) return base;
  for (let suffix = 2; suffix < 500; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.includes(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

async function submissionCount(formId: string): Promise<number> {
  const [row] = await getDb()
    .select({ total: count() })
    .from(submission)
    .where(eq(submission.formId, formId));
  return row?.total ?? 0;
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

export async function listForms(ctx: EventContext): Promise<FormSummary[]> {
  requireCapability(ctx, 'form:manage');
  const db = getDb();
  const forms = await db.query.form.findMany({
    where: eq(form.eventId, ctx.eventId),
    orderBy: [asc(form.createdAt)],
  });
  if (forms.length === 0) return [];

  const fieldCounts = await db
    .select({ formId: formField.formId, total: count() })
    .from(formField)
    .groupBy(formField.formId);
  const submissionCounts = await db
    .select({ formId: submission.formId, total: count() })
    .from(submission)
    .where(eq(submission.eventId, ctx.eventId))
    .groupBy(submission.formId);

  const fieldsBy = new Map(fieldCounts.map((row) => [row.formId, row.total]));
  const submissionsBy = new Map(submissionCounts.map((row) => [row.formId, row.total]));

  return forms.map((row) => ({
    ...row,
    fieldCount: fieldsBy.get(row.id) ?? 0,
    submissionCount: submissionsBy.get(row.id) ?? 0,
  }));
}

export async function getForm(ctx: EventContext, formId: string): Promise<FormDetail> {
  requireCapability(ctx, 'form:manage');
  const record = await loadForm(ctx, formId);
  const [fields, participantFields, roles] = await Promise.all([
    loadFields(formId),
    loadParticipantFields(formId),
    loadFormRoles(formId),
  ]);
  return { form: record, fields, participantFields, roles };
}

/**
 * A `cfp` form is created with the locked six already in it. They are not optional furniture — the
 * review queue, agenda and embeds read their columns — so an organizer starts from a form that
 * works and removes nothing. A `portal` form has no submission behind it and starts empty.
 *
 * `F-9`'s external title is written here rather than left NULL for the runtime's fallback to cover.
 * The value is the same either way — the public page has always shown the internal name until an
 * organizer set a title — but writing it means a new form is born satisfying the required check
 * instead of failing the publish gate the first time it is used, and the organizer edits a filled
 * field rather than guessing at a blank one.
 */
export async function createForm(
  ctx: EventContext,
  input: {
    name: string;
    kind: FormKind;
    slug?: string | null;
    targetType?: FormTargetType;
    collectsParticipants?: boolean;
  },
): Promise<FormRecord> {
  requireCapability(ctx, 'form:manage');
  const name = input.name.trim();
  if (!name) throw invalid('Give the form a name', { name: 'A name is required' });

  const db = getDb();
  const slug = await uniqueFormSlug(ctx.eventId, input.slug?.trim() || name);
  const collectsParticipants = input.collectsParticipants ?? true;
  const [created] = await db
    .insert(form)
    .values({
      eventId: ctx.eventId,
      name,
      kind: input.kind,
      slug,
      targetType: input.targetType ?? 'abstract',
      collectsParticipants,
      externalTitle: name,
    })
    .returning();

  if (input.kind === 'cfp') {
    await db.insert(formField).values(seedBuiltinFields(created.id));
    if (collectsParticipants) await db.insert(formParticipantRole).values(seedRoles(created.id));
  }

  return created;
}

/**
 * `F-5` and `F-6`. Both built-in sets land with the brief's constants already on them: the starred
 * Required toggles, and the 255 / 5,000 character caps that were previously NULL — which is to say
 * unlimited — on every form this product had ever created.
 */
export function seedBuiltinFields(formId: string): Array<typeof formField.$inferInsert> {
  return [
    ...BUILTIN_FIELDS.map((key, index) => ({
      formId,
      position: index,
      step: 0,
      entity: 'abstract' as const,
      type: BUILTIN_META[key].type,
      key,
      builtinKey: key,
      label: BUILTIN_META[key].label,
      required: BUILTIN_META[key].required,
      maxLength: BUILTIN_META[key].maxLength,
    })),
    ...PARTICIPANT_BUILTIN_FIELDS.map((key, index) => ({
      formId,
      position: index,
      step: 0,
      entity: 'participant' as const,
      type: PARTICIPANT_BUILTIN_META[key].type,
      key,
      builtinKey: key,
      label: PARTICIPANT_BUILTIN_META[key].label,
      required: PARTICIPANT_BUILTIN_META[key].required,
      maxLength: PARTICIPANT_BUILTIN_META[key].maxLength,
    })),
  ];
}

/**
 * `F-7`. Deliberately permissive out of the box — one speaker required, co-speakers allowed, no
 * ceiling anywhere. A default that blocked a submission would be a limit the organizer never chose.
 */
export function seedRoles(formId: string): Array<typeof formParticipantRole.$inferInsert> {
  return [
    {
      formId,
      kind: 'speaker' as const,
      label: PARTICIPANT_ROLE_DEFAULT_LABELS.speaker,
      position: 0,
      minCount: 1,
      maxCount: 1,
    },
    {
      formId,
      kind: 'co_speaker' as const,
      label: PARTICIPANT_ROLE_DEFAULT_LABELS.co_speaker,
      position: 1,
      minCount: 0,
      maxCount: null,
    },
  ];
}

/**
 * A participant stage without a role cannot add anybody. Keep the repair in one helper because it
 * is needed at both invariant boundaries: publishing an older form and turning participants on for
 * a form that is already live. Existing role sets are organizer configuration and stay untouched.
 */
async function ensureFormRoles(formId: string): Promise<void> {
  const db = getDb();
  const roles = await db.query.formParticipantRole.findMany({
    where: eq(formParticipantRole.formId, formId),
  });
  if (roles.length > 0) return;

  await db
    .insert(formParticipantRole)
    .values(seedRoles(formId))
    .onConflictDoNothing({
      target: [formParticipantRole.formId, formParticipantRole.kind],
    });
}

export type FormSettingsPatch = {
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
  opensAt?: Date | null;
  closesAt?: Date | null;
  /** `F-13` */
  maxSubmissionsPerUser?: number | null;
  /** `F-14` */
  allowDrafts?: boolean;
  /** `F-16` */
  notifyEmails?: string[];
  confirmationSubject?: string | null;
  confirmationBodyMarkdown?: string | null;
};

export async function updateForm(
  ctx: EventContext,
  formId: string,
  patch: FormSettingsPatch,
): Promise<FormRecord> {
  requireCapability(ctx, 'form:manage');
  const existing = await loadForm(ctx, formId);

  const values: Partial<typeof form.$inferInsert> = { updatedAt: new Date() };

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw invalid('Give the form a name', { name: 'A name is required' });
    values.name = name;
  }
  if (patch.slug !== undefined) {
    values.slug = await uniqueFormSlug(ctx.eventId, patch.slug, formId);
  }
  if (patch.kind !== undefined) values.kind = patch.kind;
  if (patch.targetType !== undefined) values.targetType = patch.targetType;
  if (patch.collectsParticipants !== undefined) {
    values.collectsParticipants = patch.collectsParticipants;
  }
  /**
   * `F-9`. Both starred fields are checked here the same way `name` is, and for the same reason: a
   * value the brief marks required is not something a save is allowed to take away. The check reads
   * only what the patch actually carries, so a writer touching the close date is not asked about the
   * welcome screen — the form that has never had one is caught by the publish gate instead, which is
   * where a legacy row can be repaired without the organizer being locked out of every other setting.
   */
  if (hasWelcomeScreen(patch.kind ?? existing.kind)) {
    const problems = welcomeScreenErrors({
      externalTitle: patch.externalTitle,
      pageHeading: patch.pageHeading,
    });
    const touched = (['externalTitle', 'pageHeading'] as const).filter(
      (key) => patch[key] !== undefined && problems[key],
    );
    const [first] = touched;
    if (first) {
      throw invalid(
        first === 'externalTitle'
          ? 'Give the form an external title, which speakers read at the top of the page'
          : `The page heading is required, and limited to ${PAGE_HEADING_MAX_LENGTH} characters`,
        Object.fromEntries(touched.map((key) => [key, problems[key]])),
      );
    }
  }

  if (patch.externalTitle !== undefined) values.externalTitle = patch.externalTitle?.trim() || null;
  if (patch.pageHeading !== undefined) values.pageHeading = patch.pageHeading?.trim() || null;
  if (patch.showWelcome !== undefined) values.showWelcome = patch.showWelcome;
  if (patch.maxParticipants !== undefined) {
    if (patch.maxParticipants !== null && patch.maxParticipants < 1) {
      throw invalid('A participant cap has to be at least 1', {
        maxParticipants: 'Use 1 or more, or leave it blank for no cap',
      });
    }
    // `F-7`: the cap and the per-role minimums have to be satisfiable together, and the organizer
    // finds that out here rather than from a speaker stuck on the participant stage.
    validateRoleConfiguration(await loadFormRoles(formId), patch.maxParticipants);
    values.maxParticipants = patch.maxParticipants;
  }
  if (patch.introMarkdown !== undefined) values.introMarkdown = patch.introMarkdown;
  if (patch.opensAt !== undefined) values.opensAt = patch.opensAt;
  if (patch.closesAt !== undefined) values.closesAt = patch.closesAt;
  if (patch.maxSubmissionsPerUser !== undefined) {
    if (patch.maxSubmissionsPerUser !== null && patch.maxSubmissionsPerUser < 1) {
      throw invalid('A submission limit has to be at least 1', {
        maxSubmissionsPerUser: 'Use 1 or more, or leave it blank for no limit',
      });
    }
    values.maxSubmissionsPerUser = patch.maxSubmissionsPerUser;
  }
  if (patch.allowDrafts !== undefined) values.allowDrafts = patch.allowDrafts;
  if (patch.notifyEmails !== undefined) {
    const cleaned = patch.notifyEmails.map((email) => email.trim().toLowerCase()).filter(Boolean);
    const bad = cleaned.find((email) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email));
    if (bad) {
      throw invalid(`“${bad}” is not an email address`, {
        notifyEmails: 'Every address has to be a valid email',
      });
    }
    values.notifyEmails = [...new Set(cleaned)];
  }
  if (patch.confirmationSubject !== undefined) values.confirmationSubject = patch.confirmationSubject;
  if (patch.confirmationBodyMarkdown !== undefined) {
    values.confirmationBodyMarkdown = patch.confirmationBodyMarkdown;
  }

  if (
    patch.opensAt !== undefined ||
    patch.closesAt !== undefined
  ) {
    const opensAt = patch.opensAt !== undefined ? patch.opensAt : existing.opensAt;
    const closesAt = patch.closesAt !== undefined ? patch.closesAt : existing.closesAt;
    if (opensAt && closesAt && closesAt <= opensAt) {
      throw invalid('The close date has to come after the open date', {
        closesAt: 'Pick a date after the open date',
      });
    }
  }

  // `F-4` / `F-7`. Publishing repairs old rows too, but changing this flag on an already-open form
  // does not pass through `publishForm`. Seed in this write path so the newly visible participant
  // stage is usable immediately. The helper deliberately also repairs an already-true empty row if
  // a caller resaves it, and leaves every non-empty organizer-configured role set alone. Repair
  // before flipping the flag: if either query fails the stage stays hidden, while roles on a still-
  // hidden stage are harmless if the subsequent update itself fails.
  if (patch.collectsParticipants === true && (patch.kind ?? existing.kind) === 'cfp') {
    await ensureFormRoles(formId);
  }

  const [updated] = await getDb().update(form).set(values).where(eq(form.id, formId)).returning();
  return updated;
}

/**
 * Copies the form, its fields and its conditions. `showIf.fieldId` is remapped onto the new field
 * ids, because a condition pointing at the original form's rows is a live cross-form reference.
 */
export async function duplicateForm(
  ctx: EventContext,
  formId: string,
  name?: string,
): Promise<FormRecord> {
  requireCapability(ctx, 'form:manage');
  const source = await loadForm(ctx, formId);
  const [fields, participantFields, roles] = await Promise.all([
    loadFields(formId),
    loadParticipantFields(formId),
    loadFormRoles(formId),
  ]);
  const db = getDb();

  const copyName = (name ?? `${source.name} (copy)`).trim();
  const [created] = await db
    .insert(form)
    .values({
      eventId: ctx.eventId,
      kind: source.kind,
      targetType: source.targetType,
      collectsParticipants: source.collectsParticipants,
      name: copyName,
      slug: await uniqueFormSlug(ctx.eventId, copyName),
      status: 'draft',
      // `F-9`, same reasoning as `createForm`: a copy of a form written before the welcome screen was
      // required starts filled in rather than starting one publish attempt behind.
      externalTitle: source.externalTitle ?? copyName,
      pageHeading: source.pageHeading,
      showWelcome: source.showWelcome,
      maxParticipants: source.maxParticipants,
      introMarkdown: source.introMarkdown,
      opensAt: source.opensAt,
      closesAt: source.closesAt,
      maxSubmissionsPerUser: source.maxSubmissionsPerUser,
      allowDrafts: source.allowDrafts,
      notifyEmails: source.notifyEmails,
      confirmationSubject: source.confirmationSubject,
      confirmationBodyMarkdown: source.confirmationBodyMarkdown,
    })
    .returning();

  if (fields.length > 0) {
    const inserted = await db
      .insert(formField)
      .values(
        fields.map((field) => ({
          formId: created.id,
          position: field.position,
          step: field.step,
          entity: 'abstract' as const,
          type: field.type,
          key: field.key,
          builtinKey: field.builtinKey,
          label: field.label,
          helpText: field.helpText,
          placeholder: field.placeholder,
          required: field.required,
          options: field.options,
          minLength: field.minLength,
          maxLength: field.maxLength,
          charLimitGroup: field.charLimitGroup,
          libraryEntryId: field.libraryEntryId,
        })),
      )
      .returning();

    const idByKey = new Map(inserted.map((row) => [row.key, row.id]));
    const keyById = new Map(fields.map((field) => [field.id, field.key]));

    await Promise.all(
      fields
        .filter((field) => field.showIf)
        .map((field) => {
          const targetKey = keyById.get(field.showIf!.fieldId);
          const targetId = targetKey ? idByKey.get(targetKey) : undefined;
          const newId = idByKey.get(field.key);
          if (!newId) return Promise.resolve();
          const showIf: Condition | null = targetId ? { ...field.showIf!, fieldId: targetId } : null;
          return db.update(formField).set({ showIf }).where(eq(formField.id, newId));
        }),
    );
  }

  if (participantFields.length > 0) {
    await db.insert(formField).values(
      participantFields.map((field) => ({
        formId: created.id,
        position: field.position,
        step: field.step,
        entity: 'participant' as const,
        type: field.type,
        key: field.key,
        builtinKey: field.participantKey,
        label: field.label,
        helpText: field.helpText,
        placeholder: field.placeholder,
        required: field.required,
        options: field.options,
        minLength: field.minLength,
        maxLength: field.maxLength,
        charLimitGroup: field.charLimitGroup,
      })),
    );
  }

  if (roles.length > 0) {
    await db.insert(formParticipantRole).values(
      roles.map((role) => ({
        formId: created.id,
        kind: role.kind,
        label: role.label,
        position: role.position,
        minCount: role.minCount,
        maxCount: role.maxCount,
      })),
    );
  }

  return created;
}

export async function deleteForm(ctx: EventContext, formId: string): Promise<void> {
  requireCapability(ctx, 'form:manage');
  await loadForm(ctx, formId);
  const submissions = await submissionCount(formId);
  if (submissions > 0) {
    throw conflict(
      `This form has ${submissions} submission${submissions === 1 ? '' : 's'}. Close it instead, because deleting it would take their answers with it.`,
    );
  }
  await getDb().delete(form).where(eq(form.id, formId));
}

/**
 * The locked built-ins are an invariant of a `cfp` form, not a question about one — and an invariant
 * belongs with the engine rather than with each writer.
 *
 * `publishForm` used to *reject* a form that was missing one. That check could only ever fire on a
 * form some other writer had created, because `createForm` always inserts the full set — and it fired
 * on exactly the wrong one: `db/seed.ts` and `db/seeds/first-settlement.ts` each wrote five of the
 * six built-ins and set `status: 'open'` directly, so the seeded demo call worked until an organizer
 * opened it in the builder and pressed Publish, at which point it hard-failed with "missing built-in
 * field: tags". The organizer could not act on that message either, because the builder deliberately
 * offers no way to add a built-in — they are not in the palette.
 *
 * So the invariant is repaired instead of reported. The seeds are fixed too, at their source; this is
 * the belt to that pair of braces, and it is what upgrades every form already sitting in a database.
 */
export async function ensureFormBuiltins(formId: string, kind: FormKind): Promise<void> {
  if (kind !== 'cfp') return;
  const db = getDb();

  const rows = await db.query.formField.findMany({ where: eq(formField.formId, formId) });
  const taken = new Set(rows.map((row) => row.key));
  const present = new Set(rows.map((row) => `${row.entity}:${row.builtinKey}`));

  const missing = seedBuiltinFields(formId).filter(
    (field) => !present.has(`${field.entity}:${field.builtinKey}`) && !taken.has(field.key),
  );
  if (missing.length > 0) {
    // Appended after whatever the organizer already arranged, per entity, rather than inserted into
    // the middle of a running order they chose.
    const lastOf = new Map<string, number>();
    for (const row of rows) {
      lastOf.set(row.entity, Math.max(lastOf.get(row.entity) ?? -1, row.position));
    }
    const nextOf = new Map(lastOf);
    await db.insert(formField).values(
      missing.map((field) => {
        const position = (nextOf.get(field.entity!) ?? -1) + 1;
        nextOf.set(field.entity!, position);
        return { ...field, position };
      }),
    );
  }

  await ensureFormRoles(formId);
}

/**
 * The built-in choice questions and the taxonomy table each one draws its choices from. `level` is
 * absent on purpose: it falls back to a constant list, so it is never empty.
 */
const BUILTIN_CHOICE_SOURCES = [
  { key: 'format' as const, noun: 'session formats', table: sessionFormat },
  { key: 'track' as const, noun: 'tracks', table: track },
  { key: 'tags' as const, noun: 'tags', table: tag },
];

async function firstRequiredBuiltinWithoutChoices(
  eventId: string,
  fields: FormFieldSpec[],
): Promise<{ label: string; noun: string } | null> {
  for (const source of BUILTIN_CHOICE_SOURCES) {
    const field = fields.find((entry) => entry.builtinKey === source.key && entry.required);
    if (!field) continue;
    const [row] = await getDb()
      .select({ total: count() })
      .from(source.table)
      .where(eq(source.table.eventId, eventId));
    if ((row?.total ?? 0) === 0) return { label: field.label, noun: source.noun };
  }
  return null;
}

/**
 * `validateConditions` is the last gate before a form goes live: a one-hop violation that reaches
 * the runtime is a question that renders for nobody, and nothing on screen says so.
 */
export async function publishForm(ctx: EventContext, formId: string): Promise<FormRecord> {
  requireCapability(ctx, 'form:manage');
  const record = await loadForm(ctx, formId);
  await ensureFormBuiltins(formId, record.kind);
  const fields = await loadFields(formId);

  if (!fields.some((field) => collectsAnswer(field.type))) {
    throw invalid('A form needs at least one question before it can open');
  }

  /**
   * `F-9`. The starred welcome fields are checked here as well as on save, because save-time alone
   * only ever sees the forms somebody edits: every `cfp` form written before this rule existed
   * carries NULL in both columns, and the runtime's silent fallback meant nothing ever said so.
   *
   * It is a gate rather than a repair — the opposite of `ensureFormBuiltins` above — because the two
   * failures are not the same shape. A missing built-in was unfixable from the builder, so reporting
   * it was cruelty; a missing title is two text boxes on the Settings tab, and only the organizer
   * knows what they should say. Guessing on their behalf is how a public page ends up headed with an
   * internal note.
   */
  if (hasWelcomeScreen(record.kind)) {
    const problems = welcomeScreenErrors(record);
    if (Object.keys(problems).length > 0) {
      throw invalid(
        'The welcome screen is not finished. Fill in the external form title and the page heading under Settings',
        problems,
      );
    }
  }

  const missingOptions = fields.find(
    (field) => supportsOptions(field.type) && !field.builtinKey && (field.options ?? []).length === 0,
  );
  if (missingOptions) {
    throw invalid(`“${missingOptions.label}” needs at least one choice before the form can open`);
  }

  /**
   * The same rule, for the built-ins the check above deliberately skips. Their choices come from the
   * event taxonomy rather than from the builder, so the field row looks fine while the question is
   * unanswerable — and a new event starts with no formats, tracks or tags at all. Left alone, the
   * default call for papers opened with a required `Tags` that rendered as no control whatsoever and
   * then rejected every submission. The runtime drops the requirement so nobody is stuck, and this
   * says so at the one moment the organizer can still fix it.
   */
  const emptyBuiltin = await firstRequiredBuiltinWithoutChoices(ctx.eventId, fields);
  if (emptyBuiltin) {
    throw invalid(
      `“${emptyBuiltin.label}” is required but this event has no ${emptyBuiltin.noun} to choose from. ` +
        `Add at least one under Settings, or make the question optional.`,
    );
  }

  // `F-7`: a form whose minimums cannot fit under its own cap would take nobody's submission.
  if (record.collectsParticipants) {
    validateRoleConfiguration(await loadFormRoles(formId), record.maxParticipants);
  }

  validateConditions(fields);

  const [updated] = await getDb()
    .update(form)
    .set({ status: 'open', updatedAt: new Date() })
    .where(eq(form.id, formId))
    .returning();
  return updated;
}

export async function setFormStatus(
  ctx: EventContext,
  formId: string,
  status: FormStatus,
): Promise<FormRecord> {
  requireCapability(ctx, 'form:manage');
  if (status === 'open') return publishForm(ctx, formId);
  await loadForm(ctx, formId);
  const [updated] = await getDb()
    .update(form)
    .set({ status, updatedAt: new Date() })
    .where(eq(form.id, formId))
    .returning();
  return updated;
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

export type NewFieldInput = {
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
  libraryEntryId?: string | null;
  /**
   * Where the question lands in the running order. Omitted, it goes last. It travels with the insert
   * rather than in a follow-up `reorderFields` call because that call has to describe the whole form,
   * and the builder could only describe the form as it stood *before* the insert — so a mid-form add
   * was reliably rejected for not covering every question.
   */
  index?: number;
};

export async function addField(
  ctx: EventContext,
  formId: string,
  input: NewFieldInput,
): Promise<BuilderField> {
  requireCapability(ctx, 'form:manage');
  await loadForm(ctx, formId);
  const fields = await loadFields(formId);

  const label = input.label.trim();
  if (!label) throw invalid('Give the question a label', { label: 'A label is required' });

  // Keys are unique per form across both entities, because that is what the database enforces —
  // narrowing this to the abstract fields would hand the insert a duplicate-key error to raise.
  const key = uniqueFieldKey(
    (await loadAllFields(formId)).map((field) => field.key),
    label,
  );
  const position = fields.reduce((max, field) => Math.max(max, field.position), -1) + 1;
  const step = input.step ?? fields.reduce((max, field) => Math.max(max, field.step), 0);

  const [created] = await getDb()
    .insert(formField)
    .values({
      formId,
      position,
      step,
      type: input.type,
      key,
      label,
      helpText: input.helpText ?? null,
      placeholder: input.placeholder ?? null,
      required: input.required ?? false,
      options: input.options ?? null,
      minLength: input.minLength ?? null,
      maxLength: input.maxLength ?? null,
      charLimitGroup: input.charLimitGroup ?? null,
      libraryEntryId: input.libraryEntryId ?? null,
    })
    .returning();

  if (input.index === undefined) return toBuilderField(created);

  // A new question carries no condition and nothing points at it yet, and the fields around it keep
  // their relative order, so no existing `showIf` can be invalidated by where it lands.
  const ordering = fields.map((field) => field.id);
  ordering.splice(Math.max(0, Math.min(input.index, ordering.length)), 0, created.id);
  const db = getDb();
  await Promise.all(
    ordering.map((id, index) =>
      db.update(formField).set({ position: index }).where(eq(formField.id, id)),
    ),
  );

  return toBuilderField({ ...created, position: ordering.indexOf(created.id) });
}

export type FieldPatch = {
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

export async function updateField(
  ctx: EventContext,
  formId: string,
  fieldId: string,
  patch: FieldPatch,
): Promise<BuilderField> {
  requireCapability(ctx, 'form:manage');
  await loadForm(ctx, formId);
  const all = await loadAllFields(formId);
  const existing = all.find((field) => field.id === fieldId);
  if (!existing) throw notFound('That question');
  // Conditions only ever reach across one entity, so the sibling set a condition may name is the
  // set this field belongs to.
  const fields = all.filter((field) => field.entity === existing.entity);

  const values: Partial<typeof formField.$inferInsert> = {};

  if (patch.label !== undefined) {
    const label = patch.label.trim();
    if (!label) throw invalid('Give the question a label', { label: 'A label is required' });
    values.label = label;
  }

  if (patch.type !== undefined && patch.type !== existing.type) {
    if (!canChangeFieldType(existing)) {
      throw invalid(
        `“${existing.label}” is a built-in field. Its answer lives in a real submission column, so its type is fixed.`,
      );
    }
    values.type = patch.type;
  }

  const nextType = values.type ?? existing.type;

  if (patch.helpText !== undefined) values.helpText = patch.helpText;
  if (patch.placeholder !== undefined) values.placeholder = patch.placeholder;
  if (patch.required !== undefined) {
    // `F-6`: First Name, Last Name and Email are locked required. A participant nobody can name or
    // contact is a row that costs the organizer a support thread and gains them nothing.
    if (patch.required !== existing.required && !canChangeRequired(existing)) {
      throw invalid(
        `“${existing.label}” is always required on a participant. It is what identifies the person.`,
      );
    }
    values.required = patch.required;
  }
  if (patch.step !== undefined) values.step = Math.max(0, patch.step);
  if (patch.charLimitGroup !== undefined) {
    values.charLimitGroup = patch.charLimitGroup?.trim() || null;
  }

  if (patch.options !== undefined) {
    const options = (patch.options ?? []).map((option) => option.trim()).filter(Boolean);
    values.options = supportsOptions(nextType) && options.length > 0 ? options : null;
  } else if (values.type && !supportsOptions(nextType)) {
    values.options = null;
  }

  if (patch.minLength !== undefined) values.minLength = patch.minLength;
  if (patch.maxLength !== undefined) values.maxLength = patch.maxLength;

  // `F-5`/`F-6`: a built-in's cap is a ceiling, not just a starting value. An organizer may tighten
  // Title below 255 or Description below 5,000; raising it past what the rest of the product is built
  // around is a change whose cost only shows up much later, on somebody else's screen.
  const ceiling = builtinMaxLength(existing.entity, existing.builtinKey ?? existing.participantKey);
  if (ceiling !== null && patch.maxLength !== undefined) {
    values.maxLength =
      patch.maxLength === null || patch.maxLength > ceiling ? ceiling : patch.maxLength;
  }

  const minLength = patch.minLength !== undefined ? patch.minLength : existing.minLength;
  const maxLength = values.maxLength !== undefined ? values.maxLength : existing.maxLength;
  if (minLength !== null && maxLength !== null && minLength > maxLength) {
    throw invalid('The minimum length is above the maximum', {
      minLength: 'Has to be at or below the maximum',
    });
  }
  if (values.charLimitGroup && !maxLength) {
    throw invalid('A combined character limit needs a maximum length on this question', {
      maxLength: 'Set a maximum length to use a combined limit',
    });
  }

  if (patch.showIf !== undefined) {
    if (patch.showIf === null) {
      values.showIf = null;
    } else {
      const eligible = eligibleConditionTargets(fields, fieldId);
      if (!eligible.some((field) => field.id === patch.showIf!.fieldId)) {
        throw invalid(
          `“${existing.label}” can only depend on an earlier question that is not itself conditional`,
        );
      }
      values.showIf = patch.showIf;
    }
  }

  const next = fields.map((field) =>
    field.id === fieldId ? { ...field, ...toSpecPatch(field, values) } : field,
  );
  validateConditions(next);

  const [updated] = await getDb()
    .update(formField)
    .set(values)
    .where(eq(formField.id, fieldId))
    .returning();
  return toBuilderField(updated);
}

function toSpecPatch(
  field: BuilderField,
  values: Partial<typeof formField.$inferInsert>,
): Partial<FormFieldSpec> {
  return {
    label: values.label ?? field.label,
    type: values.type ?? field.type,
    required: values.required ?? field.required,
    showIf: values.showIf === undefined ? field.showIf : (values.showIf ?? null),
    step: values.step ?? field.step,
  };
}

export async function deleteField(
  ctx: EventContext,
  formId: string,
  fieldId: string,
): Promise<void> {
  requireCapability(ctx, 'form:manage');
  await loadForm(ctx, formId);
  const all = await loadAllFields(formId);
  const existing = all.find((field) => field.id === fieldId);
  if (!existing) throw notFound('That question');
  const fields = all.filter((field) => field.entity === existing.entity);

  if (!canDeleteField(existing)) {
    throw invalid(
      `“${existing.label}” is a built-in field and cannot be removed. Make it optional if you do not want to ask for it.`,
    );
  }

  const dependents = fields.filter((field) => field.showIf?.fieldId === fieldId);
  if (dependents.length > 0) {
    throw conflict(
      `${dependents.map((field) => `“${field.label}”`).join(', ')} ${dependents.length === 1 ? 'is' : 'are'} only shown based on this question. Remove that condition first.`,
    );
  }

  await getDb().delete(formField).where(eq(formField.id, fieldId));
}

export type FieldOrderItem = { id: string; step: number };

/**
 * Takes the whole running order, not a delta. A reorder can invalidate a condition — dragging a
 * question above the one it depends on — so the new order is checked before it is written.
 */
export async function reorderFields(
  ctx: EventContext,
  formId: string,
  order: FieldOrderItem[],
  entity: FieldEntity = 'abstract',
): Promise<BuilderField[]> {
  requireCapability(ctx, 'form:manage');
  await loadForm(ctx, formId);
  const fields =
    entity === 'participant' ? await loadParticipantFields(formId) : await loadFields(formId);

  if (order.length !== fields.length) {
    throw invalid('That ordering does not cover every question on the form');
  }
  const byId = new Map(fields.map((field) => [field.id, field]));
  const next: BuilderField[] = order.map((item, index) => {
    const field = byId.get(item.id);
    if (!field) throw invalid('That ordering refers to a question that is not on this form');
    return { ...field, position: index, step: Math.max(0, item.step) };
  });

  validateConditions(next);

  const db = getDb();
  await Promise.all(
    next.map((field) =>
      db
        .update(formField)
        .set({ position: field.position, step: field.step })
        .where(eq(formField.id, field.id)),
    ),
  );
  return next;
}

// ---------------------------------------------------------------------------
// `E-5` field library
// ---------------------------------------------------------------------------

export async function listFieldLibrary(ctx: EventContext): Promise<FieldLibraryEntry[]> {
  requireCapability(ctx, 'form:manage');
  return getDb().query.fieldLibraryEntry.findMany({
    where: eq(fieldLibraryEntry.eventId, ctx.eventId),
    orderBy: [asc(fieldLibraryEntry.label)],
  });
}

export async function saveFieldToLibrary(
  ctx: EventContext,
  formId: string,
  fieldId: string,
): Promise<FieldLibraryEntry> {
  requireCapability(ctx, 'form:manage');
  await loadForm(ctx, formId);
  const fields = await loadFields(formId);
  const field = fields.find((entry) => entry.id === fieldId);
  if (!field) throw notFound('That question');
  if (field.builtinKey) {
    throw invalid('Built-in fields are already on every call for speakers, so there is nothing to save.');
  }
  if (!collectsAnswer(field.type)) {
    throw invalid('A section break collects no answers, so it is not worth saving to the library.');
  }

  const db = getDb();
  const existing = await db.query.fieldLibraryEntry.findMany({
    where: eq(fieldLibraryEntry.eventId, ctx.eventId),
  });
  const key = uniqueFieldKey(
    existing.map((entry) => entry.key),
    field.key,
  );

  const [entry] = await db
    .insert(fieldLibraryEntry)
    .values({
      eventId: ctx.eventId,
      key,
      label: field.label,
      type: field.type,
      helpText: field.helpText,
      options: field.options,
    })
    .returning();

  await db.update(formField).set({ libraryEntryId: entry.id }).where(eq(formField.id, fieldId));
  return entry;
}

export async function addFieldFromLibrary(
  ctx: EventContext,
  formId: string,
  entryId: string,
  step?: number,
  index?: number,
): Promise<BuilderField> {
  requireCapability(ctx, 'form:manage');
  const entry = await getDb().query.fieldLibraryEntry.findFirst({
    where: and(eq(fieldLibraryEntry.id, entryId), eq(fieldLibraryEntry.eventId, ctx.eventId)),
  });
  if (!entry) throw notFound('That library field');

  return addField(ctx, formId, {
    type: entry.type,
    label: entry.label,
    helpText: entry.helpText,
    options: entry.options ?? null,
    step,
    index,
    libraryEntryId: entry.id,
  });
}

export async function deleteFieldLibraryEntry(ctx: EventContext, entryId: string): Promise<void> {
  requireCapability(ctx, 'form:manage');
  const entry = await getDb().query.fieldLibraryEntry.findFirst({
    where: and(eq(fieldLibraryEntry.id, entryId), eq(fieldLibraryEntry.eventId, ctx.eventId)),
  });
  if (!entry) throw notFound('That library field');
  await getDb().delete(fieldLibraryEntry).where(eq(fieldLibraryEntry.id, entryId));
}

// ---------------------------------------------------------------------------
// `F-7` — participant roles
// ---------------------------------------------------------------------------

export type RoleInput = {
  kind: ParticipantRoleKind;
  label?: string;
  minCount?: number;
  maxCount?: number | null;
};

export async function listFormRoles(
  ctx: EventContext,
  formId: string,
): Promise<ParticipantRoleSpec[]> {
  requireCapability(ctx, 'form:manage');
  await loadForm(ctx, formId);
  return loadFormRoles(formId);
}

/**
 * The whole role set at once, and the overall cap with it, because the rule that matters — the
 * minimums against the cap — is a property of the set rather than of any row in it. Saving a role at
 * a time, or the cap separately, means either refusing a legal end state because an intermediate one
 * was not, or checking nothing at all.
 */
export async function setFormRoles(
  ctx: EventContext,
  formId: string,
  input: RoleInput[],
  maxParticipants?: number | null,
): Promise<ParticipantRoleSpec[]> {
  requireCapability(ctx, 'form:manage');
  const stored = await loadForm(ctx, formId);
  // Omitting the cap means "leave it where it is"; passing null means "no cap". Both have to reach
  // `validateRoleConfiguration` as the value the form will actually end up with.
  const cap = maxParticipants === undefined ? stored.maxParticipants : maxParticipants;

  const seen = new Set<string>();
  const cleaned = input.map((role, index) => {
    if (!isParticipantRoleKind(role.kind)) throw invalid(`“${role.kind}” is not a participant role`);
    if (seen.has(role.kind)) {
      throw invalid(`${PARTICIPANT_ROLE_DEFAULT_LABELS[role.kind]} is listed twice`);
    }
    seen.add(role.kind);
    return {
      id: role.kind,
      kind: role.kind,
      label: role.label?.trim() || PARTICIPANT_ROLE_DEFAULT_LABELS[role.kind],
      position: index,
      minCount: Math.trunc(role.minCount ?? 0),
      maxCount: role.maxCount === null || role.maxCount === undefined ? null : Math.trunc(role.maxCount),
    };
  });

  if (cleaned.length === 0) {
    throw invalid('A form that collects participants needs at least one role', {
      roles: 'Keep at least one role, or turn participants off in the form settings',
    });
  }
  if (cap !== null && cap < 1) {
    throw invalid('A participant cap has to be at least 1', {
      maxParticipants: 'Use 1 or more, or leave it blank for no cap',
    });
  }
  validateRoleConfiguration(cleaned, cap);

  const db = getDb();
  if (maxParticipants !== undefined) {
    await db
      .update(form)
      .set({ maxParticipants: cap, updatedAt: new Date() })
      .where(eq(form.id, formId));
  }
  await db.delete(formParticipantRole).where(eq(formParticipantRole.formId, formId));
  await db.insert(formParticipantRole).values(
    cleaned.map((role) => ({
      formId,
      kind: role.kind,
      label: role.label,
      position: role.position,
      minCount: role.minCount,
      maxCount: role.maxCount,
    })),
  );
  return loadFormRoles(formId);
}

/**
 * `F-7`'s enforcement seam. Both writers that can put a person on a submission call this — the public
 * submit path in `lib/services/submissions.ts` and the portal's share flow — so a co-speaker added
 * from the portal is counted against exactly the limits the form was configured with. Configuration
 * that only the submit path honoured would be a limit anyone could walk around in two clicks.
 *
 * A submission whose form predates the roles it is checked against passes: the counts describe what a
 * form asks for now, and retroactively invalidating a talk somebody already had accepted is not a
 * validation, it is a bug report against the organizer.
 */
export async function assertParticipantLimits(
  formId: string,
  assigned: ParticipantRoleKind[],
  mode: 'all' | 'ceilings' = 'all',
): Promise<void> {
  const record = await getDb().query.form.findFirst({ where: eq(form.id, formId) });
  if (!record || !record.collectsParticipants) return;

  const roles = await loadFormRoles(formId);
  if (roles.length === 0) return;

  validateParticipantCounts(roles, assigned, record.maxParticipants, mode);
}

/** Used by the public runtime: the fields of an open form, in running order. */
export async function getPublishedForm(
  eventId: string,
  slug: string,
): Promise<FormDetail | null> {
  const record = await getDb().query.form.findFirst({
    where: and(eq(form.eventId, eventId), eq(form.slug, slug), ne(form.status, 'draft')),
  });
  if (!record) return null;
  const [fields, participantFields, roles] = await Promise.all([
    loadFields(record.id),
    loadParticipantFields(record.id),
    loadFormRoles(record.id),
  ]);
  return { form: record, fields, participantFields, roles };
}

export type { BuiltinKey, ParticipantRoleKind, ParticipantRoleSpec };
