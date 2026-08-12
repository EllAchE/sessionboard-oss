'use server';

import { revalidatePath } from 'next/cache';
import { isAppError } from '../../../lib/errors';
import * as forms from '../../../lib/services/forms';
import { formManageContext } from './context';
import type { ActionResult, FieldPatchWire, FormSettingsInput, NewFieldInputWire } from './types';

/**
 * Thin by construction: resolve the event, call the service, translate a thrown `AppError` into
 * something the builder can render inline. Every rule the actions appear to enforce actually lives
 * in `lib/services/forms.ts`, so the REST surface and these screens cannot drift.
 */

async function run<T>(path: string, work: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await work();
    revalidatePath(path);
    return { ok: true, data };
  } catch (error) {
    if (isAppError(error)) {
      return { ok: false, message: error.message, details: error.details };
    }
    console.error(`form builder action failed: ${String(error)}`);
    return { ok: false, message: 'Something went wrong. Try again.' };
  }
}

function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function createFormAction(input: {
  name: string;
  kind: forms.FormKind;
}): Promise<ActionResult<{ id: string }>> {
  return run('/admin/forms', async () => {
    const ctx = await formManageContext();
    const created = await forms.createForm(ctx, input);
    return { id: created.id };
  });
}

export async function updateFormAction(
  formId: string,
  patch: FormSettingsInput,
): Promise<ActionResult> {
  return run(`/admin/forms/${formId}`, async () => {
    const ctx = await formManageContext();
    await forms.updateForm(ctx, formId, {
      ...patch,
      opensAt: toDate(patch.opensAt),
      closesAt: toDate(patch.closesAt),
    });
    revalidatePath('/admin/forms');
    return null;
  });
}

export async function duplicateFormAction(formId: string): Promise<ActionResult<{ id: string }>> {
  return run('/admin/forms', async () => {
    const ctx = await formManageContext();
    const created = await forms.duplicateForm(ctx, formId);
    return { id: created.id };
  });
}

export async function deleteFormAction(formId: string): Promise<ActionResult> {
  return run('/admin/forms', async () => {
    const ctx = await formManageContext();
    await forms.deleteForm(ctx, formId);
    return null;
  });
}

export async function setFormStatusAction(
  formId: string,
  status: forms.FormStatus,
): Promise<ActionResult> {
  return run(`/admin/forms/${formId}`, async () => {
    const ctx = await formManageContext();
    await forms.setFormStatus(ctx, formId, status);
    revalidatePath('/admin/forms');
    return null;
  });
}

export async function addFieldAction(
  formId: string,
  input: NewFieldInputWire,
): Promise<ActionResult<{ id: string }>> {
  return run(`/admin/forms/${formId}`, async () => {
    const ctx = await formManageContext();
    const created = await forms.addField(ctx, formId, input);
    return { id: created.id };
  });
}

export async function updateFieldAction(
  formId: string,
  fieldId: string,
  patch: FieldPatchWire,
): Promise<ActionResult> {
  return run(`/admin/forms/${formId}`, async () => {
    const ctx = await formManageContext();
    await forms.updateField(ctx, formId, fieldId, patch);
    return null;
  });
}

export async function deleteFieldAction(formId: string, fieldId: string): Promise<ActionResult> {
  return run(`/admin/forms/${formId}`, async () => {
    const ctx = await formManageContext();
    await forms.deleteField(ctx, formId, fieldId);
    return null;
  });
}

export async function reorderFieldsAction(
  formId: string,
  order: Array<{ id: string; step: number }>,
): Promise<ActionResult> {
  return run(`/admin/forms/${formId}`, async () => {
    const ctx = await formManageContext();
    await forms.reorderFields(ctx, formId, order);
    return null;
  });
}

export async function saveFieldToLibraryAction(
  formId: string,
  fieldId: string,
): Promise<ActionResult> {
  return run(`/admin/forms/${formId}`, async () => {
    const ctx = await formManageContext();
    await forms.saveFieldToLibrary(ctx, formId, fieldId);
    return null;
  });
}

export async function addFieldFromLibraryAction(
  formId: string,
  entryId: string,
  step: number,
): Promise<ActionResult> {
  return run(`/admin/forms/${formId}`, async () => {
    const ctx = await formManageContext();
    await forms.addFieldFromLibrary(ctx, formId, entryId, step);
    return null;
  });
}

export async function deleteLibraryEntryAction(
  formId: string,
  entryId: string,
): Promise<ActionResult> {
  return run(`/admin/forms/${formId}`, async () => {
    const ctx = await formManageContext();
    await forms.deleteFieldLibraryEntry(ctx, entryId);
    return null;
  });
}
