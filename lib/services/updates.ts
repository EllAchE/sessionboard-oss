import { and, desc, eq, gte, or } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  file,
  fileComment,
  participant,
  reviewAssignment,
  reviewRound,
  room,
  scheduledSession,
  submission,
  task,
  taskAssignment,
  user,
} from '@/db/schema';
import type { EventContext } from '@/lib/context';
import { requireCapability } from '@/lib/context';
import { formatRef } from '@/lib/ids';
import { listContentRevisions, type ContentRevisionEntry } from './content';

export const UPDATE_WINDOW_DAYS = 30;
const UPDATE_WINDOW_MS = UPDATE_WINDOW_DAYS * 86_400_000;
const MATERIAL_UPDATE_MS = 1_000;
const MAX_SOURCE_ROWS = 150;
const MAX_UPDATES = 250;

export type OrganizerUpdateCategory =
  | 'submissions'
  | 'reviews'
  | 'speakers'
  | 'tasks'
  | 'program'
  | 'files';

export type OrganizerUpdateTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export type OrganizerUpdateItem = {
  id: string;
  category: OrganizerUpdateCategory;
  title: string;
  detail: string;
  occurredAt: string;
  href: string;
  tone: OrganizerUpdateTone;
};

export type SubmissionUpdateSource = {
  id: string;
  ref: number;
  title: string;
  status: (typeof submission.$inferSelect)['status'];
  submitterName: string | null;
  submitterEmail: string;
  submittedAt: Date | null;
  decidedAt: Date | null;
  updatedAt: Date;
};

export type ReviewUpdateSource = {
  id: string;
  submissionId: string;
  submissionRef: number;
  submissionTitle: string;
  roundName: string;
  reviewerName: string | null;
  reviewerEmail: string;
  completedAt: Date | null;
};

export type ParticipantUpdateSource = {
  id: string;
  displayName: string | null;
  accountName: string | null;
  accountEmail: string;
  workflowStatus: (typeof participant.$inferSelect)['workflowStatus'];
  createdAt: Date;
  updatedAt: Date;
};

export type TaskUpdateSource = {
  id: string;
  taskName: string;
  participantName: string | null;
  accountName: string | null;
  accountEmail: string;
  status: (typeof taskAssignment.$inferSelect)['status'];
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
};

export type ScheduleUpdateSource = {
  id: string;
  title: string;
  status: (typeof scheduledSession.$inferSelect)['status'];
  startsAt: Date | null;
  roomName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type FileUpdateSource = {
  id: string;
  filename: string;
  uploaderName: string | null;
  uploaderEmail: string | null;
  createdAt: Date;
};

export type FileCommentUpdateSource = {
  id: string;
  filename: string;
  authorName: string;
  createdAt: Date;
};

export type OrganizerUpdateSources = {
  submissions: SubmissionUpdateSource[];
  reviews: ReviewUpdateSource[];
  participants: ParticipantUpdateSource[];
  tasks: TaskUpdateSource[];
  sessions: ScheduleUpdateSource[];
  revisions: ContentRevisionEntry[];
  files: FileUpdateSource[];
  fileComments: FileCommentUpdateSource[];
};

function displayName(
  preferred: string | null,
  accountName: string | null,
  email: string,
): string {
  return preferred?.trim() || accountName?.trim() || email;
}

function after(date: Date | null, since: Date): date is Date {
  return Boolean(date && date.getTime() >= since.getTime());
}

function materiallyUpdated(createdAt: Date, updatedAt: Date): boolean {
  return updatedAt.getTime() - createdAt.getTime() >= MATERIAL_UPDATE_MS;
}

function submissionStatusLabel(status: SubmissionUpdateSource['status']): string {
  return {
    draft: 'draft',
    submitted: 'submitted',
    under_review: 'in review',
    accepted: 'accepted',
    declined: 'declined',
    waitlisted: 'waitlisted',
    withdrawn: 'withdrawn',
  }[status];
}

function decisionTone(status: SubmissionUpdateSource['status']): OrganizerUpdateTone {
  if (status === 'accepted') return 'success';
  if (status === 'declined' || status === 'withdrawn') return 'danger';
  if (status === 'waitlisted') return 'warning';
  return 'info';
}

function taskStatusLabel(status: TaskUpdateSource['status']): string {
  return {
    not_started: 'not started',
    in_progress: 'in progress',
    completed: 'completed',
    waived: 'waived',
  }[status];
}

function taskTitle(status: TaskUpdateSource['status'], name: string): string {
  return {
    not_started: `Task reset: ${name}`,
    in_progress: `Task started: ${name}`,
    completed: `Task completed: ${name}`,
    waived: `Task waived: ${name}`,
  }[status];
}

function taskTone(status: TaskUpdateSource['status']): OrganizerUpdateTone {
  if (status === 'completed') return 'success';
  if (status === 'waived') return 'neutral';
  if (status === 'in_progress') return 'info';
  return 'warning';
}

function scheduleState(row: ScheduleUpdateSource): string {
  const publication =
    row.status === 'published' ? 'Published' : row.status === 'cancelled' ? 'Cancelled' : 'Draft';
  if (!row.startsAt) return `${publication} and not yet scheduled`;
  return `${publication} with a time slot${row.roomName ? ` in ${row.roomName}` : ''}`;
}

/**
 * `AR-36`. Compose existing durable lifecycle facts into one organizer feed. Some tables retain
 * exact events (`submittedAt`, `decidedAt`, revisions, comments); tables with only `updatedAt` can
 * expose their latest state but cannot pretend to reconstruct several edits between two visits.
 */
export function buildOrganizerUpdateFeed(
  source: OrganizerUpdateSources,
  since: Date,
): OrganizerUpdateItem[] {
  const items: OrganizerUpdateItem[] = [];

  for (const row of source.submissions) {
    const ref = formatRef('submission', row.ref);
    if (after(row.submittedAt, since)) {
      items.push({
        id: `submission-submitted:${row.id}:${row.submittedAt.toISOString()}`,
        category: 'submissions',
        title: `New submission: ${row.title}`,
        detail: `${ref} from ${row.submitterName?.trim() || row.submitterEmail}`,
        occurredAt: row.submittedAt.toISOString(),
        href: `/admin/submissions/${row.id}`,
        tone: 'info',
      });
    }
    if (after(row.decidedAt, since)) {
      const currentDecision = ['accepted', 'declined', 'waitlisted'].includes(row.status);
      items.push({
        id: `submission-decided:${row.id}:${row.decidedAt.toISOString()}`,
        category: 'submissions',
        title: currentDecision
          ? `Submission ${submissionStatusLabel(row.status)}: ${row.title}`
          : `Submission decision recorded: ${row.title}`,
        detail: currentDecision
          ? `${ref} is now ${submissionStatusLabel(row.status)}`
          : `${ref} was decided and is currently ${submissionStatusLabel(row.status)}`,
        occurredAt: row.decidedAt.toISOString(),
        href: `/admin/submissions/${row.id}`,
        tone: currentDecision ? decisionTone(row.status) : 'neutral',
      });
    }
    const beforeWithdrawal = row.decidedAt ?? row.submittedAt;
    if (
      row.status === 'withdrawn' &&
      after(row.updatedAt, since) &&
      (!beforeWithdrawal || materiallyUpdated(beforeWithdrawal, row.updatedAt))
    ) {
      items.push({
        id: `submission-withdrawn:${row.id}:${row.updatedAt.toISOString()}`,
        category: 'submissions',
        title: `Submission withdrawn: ${row.title}`,
        detail: `${ref} was withdrawn from consideration`,
        occurredAt: row.updatedAt.toISOString(),
        href: `/admin/submissions/${row.id}`,
        tone: 'danger',
      });
    }
  }

  for (const row of source.reviews) {
    if (!after(row.completedAt, since)) continue;
    items.push({
      id: `review-completed:${row.id}:${row.completedAt.toISOString()}`,
      category: 'reviews',
      title: `Review completed: ${row.submissionTitle}`,
      detail: `${row.reviewerName?.trim() || row.reviewerEmail} finished ${row.roundName} for ${formatRef('submission', row.submissionRef)}`,
      occurredAt: row.completedAt.toISOString(),
      href: `/admin/submissions/${row.submissionId}`,
      tone: 'success',
    });
  }

  const participantRevisionTimes = new Map<string, number[]>();
  for (const revision of source.revisions) {
    if (revision.entityKind !== 'participant') continue;
    participantRevisionTimes.set(revision.entityId, [
      ...(participantRevisionTimes.get(revision.entityId) ?? []),
      revision.createdAt.getTime(),
    ]);
  }

  for (const row of source.participants) {
    const name = displayName(row.displayName, row.accountName, row.accountEmail);
    if (after(row.createdAt, since)) {
      items.push({
        id: `participant-created:${row.id}:${row.createdAt.toISOString()}`,
        category: 'speakers',
        title: `Speaker added: ${name}`,
        detail: `Current speaker status: ${row.workflowStatus}`,
        occurredAt: row.createdAt.toISOString(),
        href: '/admin/speakers',
        tone: 'info',
      });
    }

    const capturedByRevision = (participantRevisionTimes.get(row.id) ?? []).some(
      (stamp) => Math.abs(stamp - row.updatedAt.getTime()) < MATERIAL_UPDATE_MS,
    );
    if (
      after(row.updatedAt, since) &&
      materiallyUpdated(row.createdAt, row.updatedAt) &&
      !capturedByRevision
    ) {
      items.push({
        id: `participant-updated:${row.id}:${row.updatedAt.toISOString()}`,
        category: 'speakers',
        title: `Speaker updated: ${name}`,
        detail: `Current speaker status: ${row.workflowStatus}`,
        occurredAt: row.updatedAt.toISOString(),
        href: '/admin/speakers',
        tone: row.workflowStatus === 'confirmed' ? 'success' : 'neutral',
      });
    }
  }

  for (const row of source.tasks) {
    const name = displayName(row.participantName, row.accountName, row.accountEmail);
    if (after(row.createdAt, since)) {
      items.push({
        id: `task-assigned:${row.id}:${row.createdAt.toISOString()}`,
        category: 'tasks',
        title: `Task assigned: ${row.taskName}`,
        detail: `${name} · ${taskStatusLabel(row.status)}`,
        occurredAt: row.createdAt.toISOString(),
        href: '/admin/tasks',
        tone: 'neutral',
      });
    }
    const changedAt = row.completedAt ?? row.updatedAt;
    if (after(changedAt, since) && materiallyUpdated(row.createdAt, changedAt)) {
      items.push({
        id: `task-updated:${row.id}:${changedAt.toISOString()}`,
        category: 'tasks',
        title: taskTitle(row.status, row.taskName),
        detail: `${name} · ${taskStatusLabel(row.status)}`,
        occurredAt: changedAt.toISOString(),
        href: '/admin/tasks',
        tone: taskTone(row.status),
      });
    }
  }

  for (const row of source.sessions) {
    if (after(row.createdAt, since)) {
      items.push({
        id: `schedule-created:${row.id}:${row.createdAt.toISOString()}`,
        category: 'program',
        title: `Session added: ${row.title}`,
        detail: scheduleState(row),
        occurredAt: row.createdAt.toISOString(),
        href: '/admin/agenda',
        tone: 'info',
      });
    }
    if (after(row.updatedAt, since) && materiallyUpdated(row.createdAt, row.updatedAt)) {
      items.push({
        id: `schedule-updated:${row.id}:${row.updatedAt.toISOString()}`,
        category: 'program',
        title: `Agenda updated: ${row.title}`,
        detail: scheduleState(row),
        occurredAt: row.updatedAt.toISOString(),
        href: '/admin/agenda',
        tone:
          row.status === 'cancelled'
            ? 'danger'
            : row.status === 'published'
              ? 'success'
              : 'warning',
      });
    }
  }

  for (const revision of source.revisions) {
    if (!after(revision.createdAt, since)) continue;
    const isSpeaker = revision.entityKind === 'participant';
    items.push({
      id: `content-revision:${revision.id}:${revision.createdAt.toISOString()}`,
      category: isSpeaker ? 'speakers' : 'program',
      title: `${isSpeaker ? 'Speaker profile' : 'Session content'} changed: ${revision.entityLabel}`,
      detail: `${revision.editorName} · ${revision.summary}`,
      occurredAt: revision.createdAt.toISOString(),
      href: '/admin/submissions/files/history',
      tone: 'neutral',
    });
  }

  for (const row of source.files) {
    if (!after(row.createdAt, since)) continue;
    const uploader = row.uploaderName?.trim() || row.uploaderEmail;
    items.push({
      id: `file-uploaded:${row.id}:${row.createdAt.toISOString()}`,
      category: 'files',
      title: `File uploaded: ${row.filename}`,
      detail: uploader ? `Uploaded by ${uploader}` : 'Uploaded to this event',
      occurredAt: row.createdAt.toISOString(),
      href: '/admin/submissions/files',
      tone: 'info',
    });
  }

  for (const row of source.fileComments) {
    if (!after(row.createdAt, since)) continue;
    items.push({
      id: `file-comment:${row.id}:${row.createdAt.toISOString()}`,
      category: 'files',
      title: `New comment on ${row.filename}`,
      detail: `${row.authorName} added a deliverable comment`,
      occurredAt: row.createdAt.toISOString(),
      href: '/admin/submissions/files/deliverables',
      tone: 'info',
    });
  }

  return items
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id))
    .slice(0, MAX_UPDATES);
}

export async function listOrganizerUpdates(
  ctx: EventContext,
  now = new Date(),
): Promise<{ items: OrganizerUpdateItem[]; since: Date; generatedAt: Date }> {
  requireCapability(ctx, 'submission:read_all');
  const db = getDb();
  const since = new Date(now.getTime() - UPDATE_WINDOW_MS);

  const [submissions, reviews, participants, tasks, sessions, revisions, files, fileComments] =
    await Promise.all([
      db
        .select({
          id: submission.id,
          ref: submission.ref,
          title: submission.title,
          status: submission.status,
          submitterName: user.name,
          submitterEmail: user.email,
          submittedAt: submission.submittedAt,
          decidedAt: submission.decidedAt,
          updatedAt: submission.updatedAt,
        })
        .from(submission)
        .innerJoin(user, eq(user.id, submission.submitterUserId))
        .where(
          and(
            eq(submission.eventId, ctx.eventId),
            or(
              gte(submission.submittedAt, since),
              gte(submission.decidedAt, since),
              gte(submission.updatedAt, since),
            ),
          ),
        )
        .orderBy(desc(submission.updatedAt))
        .limit(MAX_SOURCE_ROWS),
      db
        .select({
          id: reviewAssignment.id,
          submissionId: submission.id,
          submissionRef: submission.ref,
          submissionTitle: submission.title,
          roundName: reviewRound.name,
          reviewerName: user.name,
          reviewerEmail: user.email,
          completedAt: reviewAssignment.completedAt,
        })
        .from(reviewAssignment)
        .innerJoin(reviewRound, eq(reviewRound.id, reviewAssignment.reviewRoundId))
        .innerJoin(submission, eq(submission.id, reviewAssignment.submissionId))
        .innerJoin(user, eq(user.id, reviewAssignment.reviewerUserId))
        .where(
          and(eq(reviewRound.eventId, ctx.eventId), gte(reviewAssignment.completedAt, since)),
        )
        .orderBy(desc(reviewAssignment.completedAt))
        .limit(MAX_SOURCE_ROWS),
      db
        .select({
          id: participant.id,
          displayName: participant.displayName,
          accountName: user.name,
          accountEmail: user.email,
          workflowStatus: participant.workflowStatus,
          createdAt: participant.createdAt,
          updatedAt: participant.updatedAt,
        })
        .from(participant)
        .innerJoin(user, eq(user.id, participant.userId))
        .where(
          and(
            eq(participant.eventId, ctx.eventId),
            or(gte(participant.createdAt, since), gte(participant.updatedAt, since)),
          ),
        )
        .orderBy(desc(participant.updatedAt))
        .limit(MAX_SOURCE_ROWS),
      db
        .select({
          id: taskAssignment.id,
          taskName: task.name,
          participantName: participant.displayName,
          accountName: user.name,
          accountEmail: user.email,
          status: taskAssignment.status,
          createdAt: taskAssignment.createdAt,
          updatedAt: taskAssignment.updatedAt,
          completedAt: taskAssignment.completedAt,
        })
        .from(taskAssignment)
        .innerJoin(task, eq(task.id, taskAssignment.taskId))
        .innerJoin(participant, eq(participant.id, taskAssignment.participantId))
        .innerJoin(user, eq(user.id, participant.userId))
        .where(
          and(
            eq(task.eventId, ctx.eventId),
            or(gte(taskAssignment.createdAt, since), gte(taskAssignment.updatedAt, since)),
          ),
        )
        .orderBy(desc(taskAssignment.updatedAt))
        .limit(MAX_SOURCE_ROWS),
      db
        .select({
          id: scheduledSession.id,
          title: scheduledSession.title,
          status: scheduledSession.status,
          startsAt: scheduledSession.startsAt,
          roomName: room.name,
          createdAt: scheduledSession.createdAt,
          updatedAt: scheduledSession.updatedAt,
        })
        .from(scheduledSession)
        .leftJoin(room, eq(room.id, scheduledSession.roomId))
        .where(
          and(
            eq(scheduledSession.eventId, ctx.eventId),
            or(gte(scheduledSession.createdAt, since), gte(scheduledSession.updatedAt, since)),
          ),
        )
        .orderBy(desc(scheduledSession.updatedAt))
        .limit(MAX_SOURCE_ROWS),
      listContentRevisions(ctx, { limit: MAX_SOURCE_ROWS }),
      db
        .select({
          id: file.id,
          filename: file.filename,
          uploaderName: user.name,
          uploaderEmail: user.email,
          createdAt: file.createdAt,
        })
        .from(file)
        .leftJoin(user, eq(user.id, file.uploadedByUserId))
        .where(and(eq(file.eventId, ctx.eventId), gte(file.createdAt, since)))
        .orderBy(desc(file.createdAt))
        .limit(MAX_SOURCE_ROWS),
      db
        .select({
          id: fileComment.id,
          filename: file.filename,
          authorName: fileComment.authorName,
          createdAt: fileComment.createdAt,
        })
        .from(fileComment)
        .innerJoin(file, eq(file.id, fileComment.fileId))
        .where(and(eq(file.eventId, ctx.eventId), gte(fileComment.createdAt, since)))
        .orderBy(desc(fileComment.createdAt))
        .limit(MAX_SOURCE_ROWS),
    ]);

  return {
    items: buildOrganizerUpdateFeed(
      { submissions, reviews, participants, tasks, sessions, revisions, files, fileComments },
      since,
    ),
    since,
    generatedAt: now,
  };
}
