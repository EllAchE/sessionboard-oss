'use server';

import { revalidatePath } from 'next/cache';
import { isAppError } from '@/lib/errors';
import {
  attachExternalRecording,
  attachStoredRecording,
  removeRecording,
  setRecordingPublished,
} from '@/lib/services/recordings';
import { recordingsContext } from './context';

export type RecordingActionResult =
  | { ok: true }
  | { ok: false; message: string };

function refresh(slug?: string) {
  revalidatePath('/organizer/recordings');
  if (slug) {
    revalidatePath(`/${slug}`);
    revalidatePath(`/${slug}/sessions`);
    revalidatePath(`/${slug}/agenda`);
    revalidatePath(`/embed/${slug}`, 'layout');
  }
}

async function run(work: () => Promise<void>): Promise<RecordingActionResult> {
  try {
    await work();
    return { ok: true };
  } catch (error) {
    if (isAppError(error)) return { ok: false, message: error.message };
    console.error(`recording action failed: ${String(error)}`);
    return { ok: false, message: 'Something went wrong. Try again.' };
  }
}

export async function attachExternalRecordingAction(
  sessionId: string,
  url: string,
): Promise<RecordingActionResult> {
  return run(async () => {
    const ctx = await recordingsContext();
    await attachExternalRecording(ctx, sessionId, url);
    refresh();
  });
}

export async function attachStoredRecordingAction(
  sessionId: string,
  fileId: string,
): Promise<RecordingActionResult> {
  return run(async () => {
    const ctx = await recordingsContext();
    await attachStoredRecording(ctx, sessionId, fileId);
    refresh();
  });
}

export async function setRecordingPublishedAction(
  recordingId: string,
  published: boolean,
  eventSlug: string,
): Promise<RecordingActionResult> {
  return run(async () => {
    const ctx = await recordingsContext();
    await setRecordingPublished(ctx, recordingId, published);
    refresh(eventSlug);
  });
}

export async function removeRecordingAction(
  recordingId: string,
  eventSlug: string,
): Promise<RecordingActionResult> {
  return run(async () => {
    const ctx = await recordingsContext();
    await removeRecording(ctx, recordingId);
    refresh(eventSlug);
  });
}
