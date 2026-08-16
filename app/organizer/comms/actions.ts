'use server';

import { revalidatePath } from 'next/cache';
import {
  deleteTemplate,
  ensureDefaultTemplates,
  previewCampaign,
  saveTemplate,
  sendCampaign,
  type AudienceSpec,
  type ChannelSelection,
  type PreviewResult,
  type SendOutcome,
} from '@/lib/services/comms';
import { runScheduledJobs } from '@/lib/services/comms';
import { requireEventContext } from '@/lib/auth';
import { requireCapability } from '@/lib/context';
import { currentEventId } from '@/lib/services/events';

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

/**
 * Every action here carries its event in the form body, which the browser is free to rewrite. The
 * capability check is what turns that id back into an assertion, and `event:manage` is the right
 * bar: these actions all send mail on the event's behalf.
 */
async function manageableEventId(data: FormData): Promise<string> {
  const ctx = await requireEventContext(String(data.get('eventId') ?? ''));
  requireCapability(ctx, 'event:manage');
  return ctx.eventId;
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

function channelFromForm(data: FormData): ChannelSelection {
  const raw = data.get('channel');
  return raw === 'email' || raw === 'sms' ? raw : 'auto';
}

export async function saveTemplateAction(data: FormData): Promise<ActionResult<{ key: string }>> {
  try {
    const eventId = await manageableEventId(data);
    const row = await saveTemplate({
      eventId,
      key: String(data.get('key') ?? ''),
      name: String(data.get('name') ?? ''),
      subject: String(data.get('subject') ?? ''),
      bodyMarkdown: String(data.get('bodyMarkdown') ?? ''),
      enabled: data.get('enabled') !== 'off',
      attachIcs: data.get('attachIcs') === 'on',
      smsBody: String(data.get('smsBody') ?? '') || null,
    });
    revalidatePath('/organizer/comms/templates');
    return { ok: true, data: { key: row.key } };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteTemplateAction(data: FormData): Promise<ActionResult<null>> {
  try {
    await deleteTemplate(await manageableEventId(data), String(data.get('templateId') ?? ''));
    revalidatePath('/organizer/comms/templates');
    return { ok: true, data: null };
  } catch (error) {
    return fail(error);
  }
}

export async function restoreDefaultTemplatesAction(
  data: FormData,
): Promise<ActionResult<null>> {
  try {
    await ensureDefaultTemplates(await manageableEventId(data));
    revalidatePath('/organizer/comms/templates');
    return { ok: true, data: null };
  } catch (error) {
    return fail(error);
  }
}

export async function previewAction(data: FormData): Promise<ActionResult<PreviewResult>> {
  try {
    const result = await previewCampaign({
      eventId: await manageableEventId(data),
      subject: String(data.get('subject') ?? ''),
      bodyMarkdown: String(data.get('bodyMarkdown') ?? ''),
      audience: audienceFromForm(data),
      participantId: (data.get('participantId') as string) || null,
      channel: channelFromForm(data),
      smsBody: String(data.get('smsBody') ?? '') || null,
    });
    return { ok: true, data: result };
  } catch (error) {
    return fail(error);
  }
}

export async function sendCampaignAction(data: FormData): Promise<ActionResult<SendOutcome>> {
  try {
    const outcome = await sendCampaign({
      eventId: await manageableEventId(data),
      subject: String(data.get('subject') ?? ''),
      bodyMarkdown: String(data.get('bodyMarkdown') ?? ''),
      audience: audienceFromForm(data),
      templateKey: (data.get('templateKey') as string) || null,
      attachIcs: data.get('attachIcs') === 'on',
      channel: channelFromForm(data),
      smsBody: String(data.get('smsBody') ?? '') || null,
    });
    revalidatePath('/organizer/mail');
    revalidatePath('/organizer/sms');
    return { ok: true, data: outcome };
  } catch (error) {
    return fail(error);
  }
}

/**
 * The same work `/api/cron` does, on a button — so the reminder path is demonstrable on demand.
 * Scoped to the current event: cron speaks for the deployment, an organizer only for their own.
 */
export async function runRemindersAction(): Promise<
  ActionResult<{ taskRemindersSent: number; deadlineRemindersSent: number }>
> {
  try {
    const ctx = await requireEventContext(await currentEventId());
    requireCapability(ctx, 'event:manage');
    const result = await runScheduledJobs({ eventId: ctx.eventId });
    revalidatePath('/organizer/mail');
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
