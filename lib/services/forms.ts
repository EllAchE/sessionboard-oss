import { and, asc, count, eq, ne } from 'drizzle-orm';
import { getDb } from '../../db/client';
import { fieldLibraryEntry, form, formField, submission } from '../../db/schema';
import {
  canChangeFieldType,
  canDeleteField,
  collectsAnswer,
  eligibleConditionTargets,
  supportsOptions,
  uniqueFieldKey,
} from '../../app/admin/forms/field-rules';
import { requireCapability } from '../context';
import type { EventContext } from '../context';
import { conflict, invalid, notFound } from '../errors';
import {
  BUILTIN_FIELDS,
  BUILTIN_META,
  isBuiltinKey,
  validateConditions,
  type BuiltinKey,
  type Condition,
  type FieldType,
  type FormFieldSpec,
} from '../forms/contract';
import { slugify } from '../ids';

/**
 * Form CRUD, field CRUD and the publish gate. Pure TypeScript: the builder's Server Actions and the
 * public runtime both call in here, and neither the rules nor the locking live anywhere else.
 */

export type FormRecord = typeof form.$inferSelect;
export type FormKind = FormRecord['kind'];
export type FormStatus = FormRecord['status'];
export type FieldLibraryEntry = typeof fieldLibraryEntry.$inferSelect;

/** `FormFieldSpec` plus the columns only the builder cares about. */
export type BuilderField = FormFieldSpec & {
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
  fields: BuilderField[];
};

type FieldRow = typeof formField.$inferSelect;

function toBuilderField(row: FieldRow): BuilderField {
  return {
    id: row.id,
    key: row.key,
    builtinKey: isBuiltinKey(row.builtinKey) ? row.builtinKey : null,
    type: row.type,
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

async function loadForm(ctx: EventContext, formId: string): Promise<FormRecord> {
  const row = await getDb().query.form.findFirst({
    where: and(eq(form.id, formId), eq(form.eventId, ctx.eventId)),
  });
  if (!row) throw notFound('That form');
  return row;
}

async function loadFields(formId: string): Promise<BuilderField[]> {
  const rows = await getDb().query.formField.findMany({
    where: eq(formField.formId, formId),
    orderBy: [asc(formField.position)],
  });
  return rows.map(toBuilderField);
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
  return { form: record, fields: await loadFields(formId) };
}

/**
 * A `cfp` form is created with the locked six already in it. They are not optional furniture — the
 * review queue, agenda and embeds read their columns — so an organizer starts from a form that
 * works and removes nothing. A `portal` form has no submission behind it and starts empty.
 */
export async function createForm(
  ctx: EventContext,
  input: { name: string; kind: FormKind; slug?: string | null },
): Promise<FormRecord> {
  requireCapability(ctx, 'form:manage');
  const name = input.name.trim();
  if (!name) throw invalid('Give the form a name', { name: 'A name is required' });

  const db = getDb();
  const slug = await uniqueFormSlug(ctx.eventId, input.slug?.trim() || name);
  const [created] = await db
    .insert(form)
    .values({ eventId: ctx.eventId, name, kind: input.kind, slug })
    .returning();

  if (input.kind === 'cfp') {
    await db.insert(formField).values(
      BUILTIN_FIELDS.map((key, index) => ({
        formId: created.id,
        position: index,
        step: 0,
        type: BUILTIN_META[key].type,
        key,
        builtinKey: key,
        label: BUILTIN_META[key].label,
        required: BUILTIN_META[key].required,
      })),
    );
  }

  return created;
}

export type FormSettingsPatch = {
  name?: string;
  slug?: string;
  kind?: FormKind;
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
  const fields = await loadFields(formId);
  const db = getDb();

  const copyName = (name ?? `${source.name} (copy)`).trim();
  const [created] = await db
    .insert(form)
    .values({
      eventId: ctx.eventId,
      kind: source.kind,
      name: copyName,
      slug: await uniqueFormSlug(ctx.eventId, copyName),
      status: 'draft',
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

  return created;
}

export async function deleteForm(ctx: EventContext, formId: string): Promise<void> {
  requireCapability(ctx, 'form:manage');
  await loadForm(ctx, formId);
  const submissions = await submissionCount(formId);
  if (submissions > 0) {
    throw conflict(
      `This form has ${submissions} submission${submissions === 1 ? '' : 's'}. Close it instead — deleting it would take their answers with it.`,
    );
  }
  await getDb().delete(form).where(eq(form.id, formId));
}

/**
 * `validateConditions` is the last gate before a form goes live: a one-hop violation that reaches
 * the runtime is a question that renders for nobody, and nothing on screen says so.
 */
export async function publishForm(ctx: EventContext, formId: string): Promise<FormRecord> {
  requireCapability(ctx, 'form:manage');
  const record = await loadForm(ctx, formId);
  const fields = await loadFields(formId);

  if (!fields.some((field) => collectsAnswer(field.type))) {
    throw invalid('A form needs at least one question before it can open');
  }

  const missingOptions = fields.find(
    (field) => supportsOptions(field.type) && !field.builtinKey && (field.options ?? []).length === 0,
  );
  if (missingOptions) {
    throw invalid(`“${missingOptions.label}” needs at least one choice before the form can open`);
  }

  if (record.kind === 'cfp') {
    const present = new Set(fields.map((field) => field.builtinKey).filter(Boolean));
    const missing = BUILTIN_FIELDS.filter((key) => !present.has(key));
    if (missing.length > 0) {
      throw invalid(
        `This call for speakers is missing built-in field${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`,
      );
    }
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

  const key = uniqueFieldKey(
    fields.map((field) => field.key),
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
  const fields = await loadFields(formId);
  const existing = fields.find((field) => field.id === fieldId);
  if (!existing) throw notFound('That question');

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
  if (patch.required !== undefined) values.required = patch.required;
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
  const minLength = patch.minLength !== undefined ? patch.minLength : existing.minLength;
  const maxLength = patch.maxLength !== undefined ? patch.maxLength : existing.maxLength;
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
  const fields = await loadFields(formId);
  const existing = fields.find((field) => field.id === fieldId);
  if (!existing) throw notFound('That question');

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
): Promise<BuilderField[]> {
  requireCapability(ctx, 'form:manage');
  await loadForm(ctx, formId);
  const fields = await loadFields(formId);

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
    throw invalid('Built-in fields are already on every call for speakers — there is nothing to save.');
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

/** Used by the public runtime: the fields of an open form, in running order. */
export async function getPublishedForm(
  eventId: string,
  slug: string,
): Promise<FormDetail | null> {
  const record = await getDb().query.form.findFirst({
    where: and(eq(form.eventId, eventId), eq(form.slug, slug), ne(form.status, 'draft')),
  });
  if (!record) return null;
  return { form: record, fields: await loadFields(record.id) };
}

export type { BuiltinKey };
