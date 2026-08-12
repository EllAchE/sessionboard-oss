'use server';

import { revalidatePath } from 'next/cache';
import {
  deleteTemplate,
  ensureDefaultTemplates,
  previewCampaign,
  saveTemplate,
  sendCampaign,
  type AudienceSpec,
  type PreviewResult,
  type SendOutcome,
} from '@/lib/services/comms';
import { runScheduledJobs } from '@/lib/services/comms';

/**
 * Server actions for the comms surfaces. Each one returns a plain result object rather than
 * throwing: a send that half-fails still has a number worth showing, and an organizer who just
 * typed a 500-word email should never lose it to an error boundary.
 */

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function fail(error: unknown): { ok: false; error: string } {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  return { ok: false, error: message };
}

function audienceFromForm(data: FormData): AudienceSpec {
  const participantIds = data.getAll('participantIds').map(String).filter(Boolean);
  return {
    kind: (data.get('audienceKind') as AudienceSpec['kind']) ?? 'accepted_speakers',
    trackId: (data.get('trackId') as string) || null,
    formatId: (data.get('formatId') as string) || null,
    taskId: (data.get('taskId') as string) || null,
    participantIds,
  };
}

export async function saveTemplateAction(data: FormData): Promise<ActionResult<{ key: string }>> {
  try {
    const eventId = String(data.get('eventId') ?? '');
    const row = await saveTemplate({
      eventId,
      key: String(data.get('key') ?? ''),
      name: String(data.get('name') ?? ''),
      subject: String(data.get('subject') ?? ''),
      bodyMarkdown: String(data.get('bodyMarkdown') ?? ''),
      enabled: data.get('enabled') !== 'off',
      attachIcs: data.get('attachIcs') === 'on',
    });
    revalidatePath('/admin/comms/templates');
    return { ok: true, data: { key: row.key } };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteTemplateAction(data: FormData): Promise<ActionResult<null>> {
  try {
    await deleteTemplate(String(data.get('eventId') ?? ''), String(data.get('templateId') ?? ''));
    revalidatePath('/admin/comms/templates');
    return { ok: true, data: null };
  } catch (error) {
    return fail(error);
  }
}

export async function restoreDefaultTemplatesAction(
  data: FormData,
): Promise<ActionResult<null>> {
  try {
    await ensureDefaultTemplates(String(data.get('eventId') ?? ''));
    revalidatePath('/admin/comms/templates');
    return { ok: true, data: null };
  } catch (error) {
    return fail(error);
  }
}

export async function previewAction(data: FormData): Promise<ActionResult<PreviewResult>> {
  try {
    const result = await previewCampaign({
      eventId: String(data.get('eventId') ?? ''),
      subject: String(data.get('subject') ?? ''),
      bodyMarkdown: String(data.get('bodyMarkdown') ?? ''),
      audience: audienceFromForm(data),
      participantId: (data.get('participantId') as string) || null,
    });
    return { ok: true, data: result };
  } catch (error) {
    return fail(error);
  }
}

export async function sendCampaignAction(data: FormData): Promise<ActionResult<SendOutcome>> {
  try {
    const outcome = await sendCampaign({
      eventId: String(data.get('eventId') ?? ''),
      subject: String(data.get('subject') ?? ''),
      bodyMarkdown: String(data.get('bodyMarkdown') ?? ''),
      audience: audienceFromForm(data),
      templateKey: (data.get('templateKey') as string) || null,
      attachIcs: data.get('attachIcs') === 'on',
    });
    revalidatePath('/admin/mail');
    return { ok: true, data: outcome };
  } catch (error) {
    return fail(error);
  }
}

/** The same work `/api/cron` does, on a button — so the reminder path is demonstrable on demand. */
export async function runRemindersAction(): Promise<
  ActionResult<{ taskRemindersSent: number; deadlineRemindersSent: number }>
> {
  try {
    const result = await runScheduledJobs();
    revalidatePath('/admin/mail');
    return {
      ok: true,
      data: {
        taskRemindersSent: result.taskRemindersSent,
        deadlineRemindersSent: result.deadlineRemindersSent,
      },
    };
  } catch (error) {
    return fail(error);
  }
}
