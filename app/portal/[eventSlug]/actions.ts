'use server';

import { revalidatePath } from 'next/cache';
import { requireEventContext } from '@/lib/auth';
import type { EventContext } from '@/lib/context';
import { isAppError, notFound } from '@/lib/errors';
import type { AnswerMap, AnswerValue, FormFieldSpec } from '@/lib/forms/contract';
import { recordRevision } from '@/lib/services/content';
import {
  NOTIFICATION_CATEGORIES,
  saveDeliveryPreferences,
} from '@/lib/services/notification-preferences';
import { addFileComment, deleteFile } from '@/lib/services/files';
import {
  ensureParticipant,
  getEventBySlug,
  listMySubmissions,
  revokeSubmissionAccess,
  setHeadshot,
  shareSubmissionAccess,
  submissionFields,
  updateMySubmission,
  updateProfile,
  withdrawSubmission,
  type Participant,
} from '@/lib/services/portal';
import { addUnavailability, removeUnavailability } from '@/lib/services/speaker-availability';
import {
  completeSimpleTask,
  listPortalTasks,
  removeTaskFile,
  reopenTask,
  saveTaskForm,
} from '@/lib/services/tasks';
import type { FormState } from '../form-state';
import { myDeliverable } from './deliverable';

/**
 * Every write the speaker can make. Each action re-resolves the session from the form's own
 * `eventSlug` rather than trusting anything the client sent, and every service call still runs its
 * own ownership check — this layer is transport and error translation, nothing else.
 *
 * Nothing here branches on `impersonatedByUserId`: `S-10` is only worth having if an organizer can
 * finish a stuck speaker's task for real.
 */

type ActionSession = { ctx: EventContext; me: Participant; eventSlug: string };

async function actionSession(formData: FormData): Promise<ActionSession> {
  const eventSlug = String(formData.get('eventSlug') ?? '');
  const event = await getEventBySlug(eventSlug);
  if (!event) throw notFound('That event');
  const ctx = await requireEventContext(event.id);
  const me = await ensureParticipant(ctx);
  return { ctx, me, eventSlug };
}

function fail(error: unknown): FormState {
  if (isAppError(error)) {
    return { status: 'error', message: error.message, details: error.details };
  }
  console.error(error instanceof Error ? error.message : String(error));
  return { status: 'error', message: 'Something went wrong. Try again.' };
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function channelOverride(formData: FormData, key: string): boolean | null {
  const value = text(formData, key);
  return value === 'on' ? true : value === 'off' ? false : null;
}

/**
 * The form runtime posts every answer as `answer:<key>`. Types are recovered from the field spec
 * rather than guessed, so an unticked checkbox stores `false` instead of vanishing.
 */
function readAnswers(fields: FormFieldSpec[], formData: FormData): AnswerMap {
  const answers: AnswerMap = {};
  for (const field of fields) {
    if (field.type === 'section_break') continue;
    const name = `answer:${field.key}`;
    let value: AnswerValue;
    switch (field.type) {
      case 'checkbox':
        value = formData.get(name) !== null;
        break;
      case 'multi_select':
        value = formData.getAll(name).map((entry) => String(entry));
        break;
      case 'number': {
        const raw = text(formData, name).trim();
        value = raw === '' ? null : Number(raw);
        break;
      }
      default:
        value = text(formData, name);
    }
    answers[field.key] = value;
  }
  return answers;
}

function refresh(eventSlug: string): void {
  revalidatePath(`/portal/${eventSlug}`, 'layout');
}

// ---------------------------------------------------------------------------
// Profile — `S-2`, `S-3`, `S-8`
// ---------------------------------------------------------------------------

export async function saveProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const { ctx, me, eventSlug } = await actionSession(formData);

    await recordRevision(ctx, 'participant', me.id, 'Edited their speaker profile');

    const labels = formData.getAll('linkLabel').map((entry) => String(entry));
    const urls = formData.getAll('linkUrl').map((entry) => String(entry));
    const links = labels
      .map((label, index) => ({ label: label.trim(), url: (urls[index] ?? '').trim() }))
      .filter((link) => link.label.length > 0 || link.url.length > 0)
      .map((link) => ({ label: link.label || link.url, url: link.url }));

    await updateProfile(ctx, me.id, {
      displayName: text(formData, 'displayName'),
      firstName: text(formData, 'firstName'),
      lastName: text(formData, 'lastName'),
      salutation: text(formData, 'salutation'),
      honorific: text(formData, 'honorific'),
      gender: text(formData, 'gender'),
      pronouns: text(formData, 'pronouns'),
      jobTitle: text(formData, 'jobTitle'),
      company: text(formData, 'company'),
      bioMarkdown: text(formData, 'bioMarkdown'),
      timezone: text(formData, 'timezone'),
      dietaryNotes: text(formData, 'dietaryNotes'),
      accessibilityNotes: text(formData, 'accessibilityNotes'),
      links,
      phone: text(formData, 'phone'),
      notifyEmail: formData.get('notifyEmail') === 'on',
      notifySms: formData.get('notifySms') === 'on',
    });

    await saveDeliveryPreferences(ctx.actor.userId, ctx.eventId, {
      timezone: text(formData, 'notificationTimezone').trim() || null,
      quietStart: text(formData, 'quietStart') || null,
      quietEnd: text(formData, 'quietEnd') || null,
      smsHourlyLimit: Number(text(formData, 'smsHourlyLimit')),
      eventNotifyEmail: channelOverride(formData, 'eventNotifyEmail'),
      eventNotifySms: channelOverride(formData, 'eventNotifySms'),
      categories: Object.fromEntries(
        NOTIFICATION_CATEGORIES.map((category) => [
          category,
          {
            notifyEmail: channelOverride(formData, `category:${category}:email`),
            notifySms: channelOverride(formData, `category:${category}:sms`),
          },
        ]),
      ),
    });

    refresh(eventSlug);
    return { status: 'ok', message: 'Profile saved' };
  } catch (error) {
    return fail(error);
  }
}

export async function removeHeadshotAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const { ctx, me, eventSlug } = await actionSession(formData);
    const fileId = me.headshotFileId;
    await setHeadshot(ctx, me.id, null);
    if (fileId) await deleteFile(ctx, fileId);
    refresh(eventSlug);
    return { status: 'ok', message: 'Headshot removed' };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Tasks — `S-14`–`S-19`
// ---------------------------------------------------------------------------

export async function completeTaskAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const { ctx, me, eventSlug } = await actionSession(formData);
    await completeSimpleTask(ctx, me.id, text(formData, 'assignmentId'));
    refresh(eventSlug);
    return { status: 'ok', message: 'Marked as done' };
  } catch (error) {
    return fail(error);
  }
}

export async function reopenTaskAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const { ctx, me, eventSlug } = await actionSession(formData);
    await reopenTask(ctx, me.id, text(formData, 'assignmentId'));
    refresh(eventSlug);
    return { status: 'ok', message: 'Reopened' };
  } catch (error) {
    return fail(error);
  }
}

export async function removeTaskFileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const { ctx, me, eventSlug } = await actionSession(formData);
    await removeTaskFile(ctx, me.id, text(formData, 'assignmentId'), text(formData, 'fileId'));
    refresh(eventSlug);
    return { status: 'ok', message: 'File removed' };
  } catch (error) {
    return fail(error);
  }
}

/** `S-17`. Save keeps the task in progress; submit validates, completes and mails the `S-19` receipt. */
export async function saveTaskFormAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const { ctx, me, eventSlug } = await actionSession(formData);
    const assignmentId = text(formData, 'assignmentId');
    const submit = text(formData, 'intent') === 'submit';

    const tasks = await listPortalTasks(ctx.eventId, me.id);
    const entry = tasks.find((row) => row.assignmentId === assignmentId);
    if (!entry?.form) throw notFound('That form');

    await saveTaskForm(ctx, me.id, assignmentId, readAnswers(entry.form.fields, formData), submit);
    refresh(eventSlug);
    return {
      status: 'ok',
      message: submit ? 'Submitted — check your email for a copy' : 'Progress saved',
    };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Deliverables — `CNT-05`
// ---------------------------------------------------------------------------

/**
 * The speaker's half of the review thread. Ownership is proven by resolving the file through the
 * speaker's own task list before anything is written.
 */
export async function postDeliverableCommentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const { ctx, me, eventSlug } = await actionSession(formData);
    const deliverable = await myDeliverable(ctx, me, text(formData, 'fileId'));
    await addFileComment(ctx, deliverable.current.id, text(formData, 'body'));
    refresh(eventSlug);
    return { status: 'ok', message: 'Comment posted — the organizers can see it' };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Sessions — `S-9`
// ---------------------------------------------------------------------------

export async function saveSubmissionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const { ctx, me, eventSlug } = await actionSession(formData);
    const submissionId = text(formData, 'submissionId');
    const formId = text(formData, 'formId');
    const fields = formId ? await submissionFields(formId) : [];

    const mine = await listMySubmissions(me.id);
    if (!mine.some((entry) => entry.id === submissionId)) throw notFound('That session');
    await recordRevision(ctx, 'session', submissionId, 'Edited the session content');

    await updateMySubmission(ctx, me.id, submissionId, {
      title: text(formData, 'title'),
      descriptionMarkdown: text(formData, 'descriptionMarkdown'),
      level: text(formData, 'level'),
      answers: fields.length > 0 ? readAnswers(fields, formData) : undefined,
    });

    refresh(eventSlug);
    return { status: 'ok', message: 'Session updated' };
  } catch (error) {
    return fail(error);
  }
}

export async function withdrawSubmissionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const { ctx, me, eventSlug } = await actionSession(formData);
    await withdrawSubmission(ctx, me.id, text(formData, 'submissionId'));
    refresh(eventSlug);
    return { status: 'ok', message: 'Session withdrawn' };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Group access — `S-13`
// ---------------------------------------------------------------------------

export async function shareAccessAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const { ctx, me, eventSlug } = await actionSession(formData);
    const kind = text(formData, 'kind');
    const member = await shareSubmissionAccess(ctx, me.id, text(formData, 'submissionId'), {
      email: text(formData, 'email'),
      name: text(formData, 'name'),
      kind: kind === '' ? undefined : (kind as 'co_speaker' | 'moderator' | 'panelist' | 'speaker'),
    });
    refresh(eventSlug);
    return { status: 'ok', message: `${member.email} now has their own portal for this session` };
  } catch (error) {
    return fail(error);
  }
}

export async function revokeAccessAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const { ctx, me, eventSlug } = await actionSession(formData);
    await revokeSubmissionAccess(
      ctx,
      me.id,
      text(formData, 'submissionId'),
      text(formData, 'targetParticipantId'),
    );
    refresh(eventSlug);
    return { status: 'ok', message: 'Access removed' };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Unavailability — `AD-2`
// ---------------------------------------------------------------------------

/**
 * The speaker declares when they *cannot* present. Blackout-shaped on purpose: no rows means no
 * constraint, so a speaker who never opens this page stays schedulable — see
 * `lib/services/speaker-availability.ts`.
 *
 * The authoring zone is resolved on the server rather than taken from the form, because the form is
 * the one place it could be tampered with or simply be stale. It is the speaker's profile timezone
 * when they have set one and the event's otherwise, which is exactly what the panel tells them it is.
 */
async function authoringTimezone(session: ActionSession): Promise<string> {
  const event = await getEventBySlug(session.eventSlug);
  return session.me.timezone ?? event?.timezone ?? 'UTC';
}

export async function addUnavailabilityAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const session = await actionSession(formData);
    await addUnavailability(session.ctx.eventId, session.me.id, {
      startDate: text(formData, 'startDate'),
      startTime: text(formData, 'startTime'),
      endDate: text(formData, 'endDate'),
      endTime: text(formData, 'endTime'),
      note: text(formData, 'note'),
      timezone: await authoringTimezone(session),
    });
    refresh(session.eventSlug);
    return { status: 'ok', message: 'Saved. Your organizers will see this on the agenda.' };
  } catch (error) {
    return fail(error);
  }
}

export async function removeUnavailabilityAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const { ctx, me, eventSlug } = await actionSession(formData);
    await removeUnavailability(ctx.eventId, me.id, text(formData, 'windowId'));
    refresh(eventSlug);
    return { status: 'ok', message: 'Removed' };
  } catch (error) {
    return fail(error);
  }
}
