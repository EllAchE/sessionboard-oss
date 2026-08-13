import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { user } from '@/db/schema';
import type { EventContext } from '@/lib/context';
import {
  ensureParticipant,
  getProfileName,
  type Participant,
  type PortalSubmission,
} from '@/lib/services/portal';
import { ensureAssignments, type PortalTask } from '@/lib/services/tasks';
import { requireSpeakerSession } from './auth';
import { formFieldPayload } from './forms';

export type SpeakerApiSession = {
  ctx: EventContext;
  me: Participant;
};

/** Resolve identity once and materialize the same participant/task state as the browser portal. */
export async function speakerApiSession(
  request: Request,
  eventSlug: string,
): Promise<SpeakerApiSession> {
  const ctx = await requireSpeakerSession(request, eventSlug);
  const me = await ensureParticipant(ctx);
  await ensureAssignments(ctx.eventId, me.id);
  return { ctx, me };
}

export function mySubmissionPayload(row: PortalSubmission) {
  return {
    id: row.id,
    ref: row.ref,
    title: row.title,
    descriptionMarkdown: row.descriptionMarkdown,
    status: row.status,
    level: row.level,
    format: row.formatName,
    track: row.trackName,
    formId: row.formId,
    formSlug: row.formSlug,
    formName: row.formName,
    editable: row.editable,
    role: row.myRole,
    isPrimary: row.isPrimary,
    answers: row.answers,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    scheduled: row.scheduled
      ? {
          ref: row.scheduled.ref,
          title: row.scheduled.title,
          startsAt: row.scheduled.startsAt?.toISOString() ?? null,
          endsAt: row.scheduled.endsAt?.toISOString() ?? null,
          room: row.scheduled.roomName,
          published: row.scheduled.published,
        }
      : null,
  };
}

export async function speakerProfilePayload(ctx: EventContext, me: Participant) {
  /**
   * `getProfileName` rather than reading `firstName` / `lastName` off the row: a user imported
   * before `F-6` has `name` and neither half, and the derived guess is what the portal profile page
   * shows them. Two surfaces reading one row through two different rules is how they drift.
   */
  const [account, name] = await Promise.all([
    getDb().query.user.findFirst({ where: eq(user.id, ctx.actor.userId) }),
    getProfileName(ctx.actor.userId),
  ]);
  return {
    displayName: me.displayName,
    // `getProfileName` returns '' for a half it has no value for; the payload says null.
    firstName: name.firstName || null,
    lastName: name.lastName || null,
    name: account?.name ?? null,
    salutation: me.salutation,
    honorific: me.honorific,
    pronouns: me.pronouns,
    gender: me.gender,
    jobTitle: me.jobTitle,
    company: me.company,
    bioMarkdown: me.bioMarkdown,
    timezone: me.timezone,
    dietaryNotes: me.dietaryNotes,
    accessibilityNotes: me.accessibilityNotes,
    links: me.links,
    email: account?.email ?? ctx.actor.email,
    phone: account?.phone ?? null,
    notifyEmail: account?.notifyEmail ?? true,
    notifySms: account?.notifySms ?? false,
  };
}

/**
 * `S-16`. One task now produces several assignment rows — one per session a speaker is on, or a
 * single shared row per session team — and this payload described none of that. `taskId` is what
 * lets a consumer read four rows as four answers to one question rather than as four unrelated
 * chores; `scope` and `shared` are what let it tell the row it holds alone from the one its whole
 * panel is looking at and may already have completed. All three come off the assignment, which is
 * where `reconcileAssignments` keeps the task's own scope in step.
 */
export function speakerTaskPayload(row: PortalTask) {
  return {
    assignmentId: row.assignmentId,
    taskId: row.taskId,
    scope: row.scope,
    shared: row.shared,
    name: row.name,
    descriptionMarkdown: row.descriptionMarkdown,
    kind: row.kind,
    status: row.status,
    required: row.required,
    dueAt: row.dueAt?.toISOString() ?? null,
    overdue: row.overdue,
    completedAt: row.completedAt?.toISOString() ?? null,
    linkUrl: row.linkUrl,
    submissionId: row.submissionId,
    submissionTitle: row.submissionTitle,
    pinnedSubmissionId: row.pinnedSubmissionId,
    answers: row.answers,
    form: row.form
      ? {
          id: row.form.id,
          name: row.form.name,
          // Through the same projection the public CFP contract uses, so `formFieldSchema` is true
          // of a task form as well as of a CFP field rather than of only one of them.
          fields: row.form.fields.map(formFieldPayload),
        }
      : null,
    fileRequest: row.fileRequest,
    files: row.files.map((file) => ({
      id: file.id,
      filename: file.filename,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
      createdAt: file.createdAt.toISOString(),
    })),
  };
}
