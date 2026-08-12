'use server';

import { revalidatePath } from 'next/cache';
import { isAppError } from '../../../lib/errors';
import * as speakers from '../../../lib/services/participants';
import { manageSpeakersContext, speakersContext } from './context';
import type { ActionResult } from './types';

function failure(error: unknown, what: string): ActionResult<never> {
  if (isAppError(error)) return { ok: false, message: error.message, details: error.details };
  console.error(`${what} failed: ${String(error)}`);
  return { ok: false, message: 'Something went wrong. Try again.' };
}

/**
 * The preview runs the same `planSpeakerImport` the import runs, on the server. A preview that
 * disagrees with the import is worse than no preview, and the plan needs the event's existing
 * speakers to say which rows are new — neither is knowable in the browser.
 */
export async function previewSpeakerImportAction(
  csv: string,
  mapping?: speakers.ColumnMapping,
): Promise<ActionResult<speakers.SpeakerImportPlan>> {
  try {
    const ctx = await speakersContext();
    return { ok: true, data: await speakers.planSpeakerImport(ctx, csv, mapping) };
  } catch (error) {
    return failure(error, 'speaker import preview');
  }
}

export async function importSpeakersAction(
  csv: string,
  mapping: speakers.ColumnMapping,
): Promise<ActionResult<speakers.SpeakerImportResult>> {
  try {
    const ctx = await manageSpeakersContext();
    const result = await speakers.importSpeakers(ctx, csv, mapping);
    revalidatePath('/admin/speakers');
    return { ok: true, data: result };
  } catch (error) {
    return failure(error, 'speaker import');
  }
}

export async function setSpeakerStatusAction(
  participantId: string,
  status: speakers.SpeakerWorkflowStatus,
): Promise<ActionResult<{ status: speakers.SpeakerWorkflowStatus }>> {
  try {
    const ctx = await manageSpeakersContext();
    const saved = await speakers.setSpeakerWorkflowStatus(ctx, participantId, status);
    revalidatePath('/admin/speakers');
    revalidatePath(`/admin/speakers/${participantId}`);
    return { ok: true, data: { status: saved } };
  } catch (error) {
    return failure(error, 'speaker status');
  }
}

export async function createSpeakerAction(
  input: speakers.SpeakerInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await manageSpeakersContext();
    const { id } = await speakers.createSpeaker(ctx, input);
    revalidatePath('/admin/speakers');
    return { ok: true, data: { id } };
  } catch (error) {
    return failure(error, 'speaker create');
  }
}

export async function updateSpeakerAction(
  participantId: string,
  input: speakers.SpeakerInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await manageSpeakersContext();
    await speakers.updateSpeaker(ctx, participantId, input);
    revalidatePath('/admin/speakers');
    revalidatePath(`/admin/speakers/${participantId}`);
    return { ok: true, data: { id: participantId } };
  } catch (error) {
    return failure(error, 'speaker update');
  }
}
