'use server';

import { revalidatePath } from 'next/cache';
import { toPublicError } from '@/lib/errors';
import * as crm from '@/lib/services/crm';
import { requireCrmOrganizer } from './context';

/**
 * Every CRM mutation. Each returns a result object rather than throwing, so a rejected merge or a
 * duplicate email surfaces as a line under the form instead of replacing a half-filled screen with
 * an error boundary.
 */

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

function fail(error: unknown): { ok: false; error: string } {
  const message = toPublicError(error).message;
  console.error(message);
  return { ok: false, error: message };
}

function revalidateDirectory() {
  revalidatePath('/crm');
  revalidatePath('/crm/dashboard');
  revalidatePath('/crm/segments');
  revalidatePath('/crm/duplicates');
  revalidatePath('/crm/pipeline');
}

export async function createContactAction(
  input: crm.ContactInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireCrmOrganizer();
    const row = await crm.createContact(actor, input);
    revalidateDirectory();
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateContactAction(
  contactId: string,
  patch: Partial<crm.ContactInput>,
): Promise<ActionResult> {
  try {
    const actor = await requireCrmOrganizer();
    await crm.updateContact(actor, contactId, patch);
    revalidateDirectory();
    revalidatePath(`/crm/${contactId}`);
    return { ok: true, data: null };
  } catch (error) {
    return fail(error);
  }
}

export async function addNoteAction(input: {
  contactId: string;
  prospectId?: string | null;
  body: string;
}): Promise<ActionResult> {
  try {
    const actor = await requireCrmOrganizer();
    await crm.addNote(actor, input);
    revalidatePath(`/crm/${input.contactId}`);
    if (input.prospectId) revalidatePath(`/crm/pipeline/${input.prospectId}`);
    return { ok: true, data: null };
  } catch (error) {
    return fail(error);
  }
}

export async function createFieldAction(input: {
  label: string;
  type: crm.CrmFieldType;
  options: string[];
}): Promise<ActionResult> {
  try {
    const actor = await requireCrmOrganizer();
    await crm.createField(actor, input);
    revalidatePath('/crm/fields');
    revalidateDirectory();
    return { ok: true, data: null };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteFieldAction(fieldId: string): Promise<ActionResult> {
  try {
    const actor = await requireCrmOrganizer();
    await crm.deleteField(actor, fieldId);
    revalidatePath('/crm/fields');
    revalidateDirectory();
    return { ok: true, data: null };
  } catch (error) {
    return fail(error);
  }
}

export async function createSegmentAction(input: {
  name: string;
  kind: crm.SegmentKind;
  filters: crm.DirectoryFilters;
  memberContactIds: string[];
}): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireCrmOrganizer();
    const row = await crm.createSegment(actor, input);
    revalidatePath('/crm/segments');
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteSegmentAction(segmentId: string): Promise<ActionResult> {
  try {
    const actor = await requireCrmOrganizer();
    await crm.deleteSegment(actor, segmentId);
    revalidatePath('/crm/segments');
    return { ok: true, data: null };
  } catch (error) {
    return fail(error);
  }
}

export async function mergeContactsAction(input: {
  primaryId: string;
  loserIds: string[];
  choices: crm.MergeChoice;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireCrmOrganizer();
    const row = await crm.mergeContacts(actor, input);
    revalidateDirectory();
    revalidatePath(`/crm/${row.id}`);
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function enrollProspectAction(input: {
  contactId: string;
  stage: crm.ProspectStage;
  score: number | null;
  rationale: string | null;
  eventId: string | null;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireCrmOrganizer();
    const row = await crm.enrollProspect(actor, input);
    revalidatePath('/crm/pipeline');
    revalidatePath(`/crm/${input.contactId}`);
    revalidatePath('/crm/dashboard');
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function moveProspectAction(input: {
  prospectId: string;
  stage: crm.ProspectStage;
  position?: number;
}): Promise<ActionResult> {
  try {
    const actor = await requireCrmOrganizer();
    await crm.moveProspect(actor, input);
    revalidatePath('/crm/pipeline');
    revalidatePath(`/crm/pipeline/${input.prospectId}`);
    revalidatePath('/crm/dashboard');
    return { ok: true, data: null };
  } catch (error) {
    return fail(error);
  }
}

export async function removeProspectAction(prospectId: string): Promise<ActionResult> {
  try {
    const actor = await requireCrmOrganizer();
    await crm.removeProspect(actor, prospectId);
    revalidatePath('/crm/pipeline');
    return { ok: true, data: null };
  } catch (error) {
    return fail(error);
  }
}

export async function pushToEventAction(input: {
  contactId: string;
  eventId: string;
}): Promise<ActionResult<{ eventName: string; created: boolean }>> {
  try {
    const actor = await requireCrmOrganizer();
    const result = await crm.pushContactToEvent(actor, input);
    revalidatePath(`/crm/${input.contactId}`);
    revalidatePath('/admin/speakers');
    revalidatePath('/crm/dashboard');
    return {
      ok: true,
      data: { eventName: result.eventName, created: result.created },
    };
  } catch (error) {
    return fail(error);
  }
}

export async function sendCampaignAction(input: {
  subject: string;
  bodyMarkdown: string;
  contactIds: string[];
  eventId: string | null;
}): Promise<ActionResult<{ sent: number; failed: number }>> {
  try {
    const actor = await requireCrmOrganizer();
    const result = await crm.sendCampaign(actor, input);
    revalidatePath('/crm/campaigns');
    revalidatePath('/crm/dashboard');
    return { ok: true, data: { sent: result.sent, failed: result.failed } };
  } catch (error) {
    return fail(error);
  }
}

export async function previewImportAction(
  csv: string,
  mapping?: crm.ImportMapping,
): Promise<ActionResult<crm.ImportPreview>> {
  try {
    const actor = await requireCrmOrganizer();
    return { ok: true, data: await crm.previewImport(actor, csv, mapping) };
  } catch (error) {
    return fail(error);
  }
}

export async function importContactsAction(
  csv: string,
  mapping: crm.ImportMapping,
): Promise<ActionResult<crm.ImportResult>> {
  try {
    const actor = await requireCrmOrganizer();
    const result = await crm.importContacts(actor, csv, mapping);
    revalidateDirectory();
    return { ok: true, data: result };
  } catch (error) {
    return fail(error);
  }
}

export async function loadSampleContactsAction(): Promise<ActionResult<crm.ImportResult>> {
  try {
    const actor = await requireCrmOrganizer();
    const result = await crm.loadSampleContacts(actor);
    revalidateDirectory();
    return { ok: true, data: result };
  } catch (error) {
    return fail(error);
  }
}
