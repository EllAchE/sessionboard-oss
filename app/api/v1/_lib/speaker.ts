import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { user } from '@/db/schema';
import type { EventContext } from '@/lib/context';
import {
  ensureParticipant,
  type Participant,
  type PortalSubmission,
} from '@/lib/services/portal';
import { ensureAssignments, type PortalTask } from '@/lib/services/tasks';
import { requireSpeakerSession } from './auth';

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
  const account = await getDb().query.user.findFirst({ where: eq(user.id, ctx.actor.userId) });
  return {
    displayName: me.displayName,
    pronouns: me.pronouns,
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

export function speakerTaskPayload(row: PortalTask) {
  return {
    assignmentId: row.assignmentId,
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
    answers: row.answers,
    form: row.form
      ? { id: row.form.id, name: row.form.name, fields: row.form.fields }
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
