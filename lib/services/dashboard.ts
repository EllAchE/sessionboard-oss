import { eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  event,
  form,
  participant,
  participantRole,
  reviewAssignment,
  reviewRound,
  room,
  scheduledSession,
  submission,
  task,
  taskAssignment,
  track,
  user,
} from '@/db/schema';
import type { EventContext } from '@/lib/context';
import { requireCapability } from '@/lib/context';

/**
 * Read models for the organizer dashboard. Every function here is a pure read: the aggregation runs
 * in JS over event-scoped rows rather than in SQL because a conference is hundreds of rows, not
 * millions, and one readable pass beats five hand-tuned GROUP BYs that each need their own test.
 */

const DAY_MS = 86_400_000;
const DUE_SOON_DAYS = 7;

export type TaskStatusValue = (typeof taskAssignment.$inferSelect)['status'];
export type TaskKindValue = (typeof task.$inferSelect)['kind'];
export type SubmissionStatusValue = (typeof submission.$inferSelect)['status'];

/** Ordering the B-1 table leads with: who is blocking us, worst first. */
export type TaskUrgency = 'overdue' | 'due_soon' | 'open' | 'done';

export const URGENCY_RANK: Record<TaskUrgency, number> = {
  overdue: 0,
  due_soon: 1,
  open: 2,
  done: 3,
};

export type OutstandingTaskRow = {
  id: string;
  participantId: string;
  participantName: string;
  participantEmail: string;
  company: string | null;
  accepted: boolean;
  sessionTitles: string[];
  taskId: string;
  taskName: string;
  taskKind: TaskKindValue;
  required: boolean;
  status: TaskStatusValue;
  dueAt: string | null;
  daysOverdue: number | null;
  daysUntilDue: number | null;
  urgency: TaskUrgency;
  lastRemindedAt: string | null;
};

function displayNameOf(
  row: { displayName: string | null },
  account: { name: string | null; email: string },
): string {
  return row.displayName?.trim() || account.name?.trim() || account.email;
}

function wholeDays(from: number, to: number): number {
  return Math.floor((to - from) / DAY_MS);
}

export function classifyUrgency(
  status: TaskStatusValue,
  dueAt: Date | null,
  now: number,
): TaskUrgency {
  if (status === 'completed' || status === 'waived') return 'done';
  if (!dueAt) return 'open';
  const due = dueAt.getTime();
  if (due < now) return 'overdue';
  if (due - now <= DUE_SOON_DAYS * DAY_MS) return 'due_soon';
  return 'open';
}

export function sortOutstanding(rows: OutstandingTaskRow[]): OutstandingTaskRow[] {
  return [...rows].sort((a, b) => {
    const rank = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
    if (rank !== 0) return rank;
    if (a.dueAt && b.dueAt && a.dueAt !== b.dueAt) return a.dueAt < b.dueAt ? -1 : 1;
    if (a.dueAt && !b.dueAt) return -1;
    if (!a.dueAt && b.dueAt) return 1;
    if (a.required !== b.required) return a.required ? -1 : 1;
    return a.participantName.localeCompare(b.participantName);
  });
}

type AcceptedIndex = Map<string, { accepted: boolean; titles: string[] }>;

async function acceptedIndex(eventId: string): Promise<AcceptedIndex> {
  const rows = await getDb()
    .select({ participantId: participantRole.participantId, submission })
    .from(participantRole)
    .innerJoin(submission, eq(participantRole.submissionId, submission.id))
    .where(eq(submission.eventId, eventId));

  const index: AcceptedIndex = new Map();
  for (const row of rows) {
    const current = index.get(row.participantId) ?? { accepted: false, titles: [] };
    if (row.submission.status === 'accepted') {
      current.accepted = true;
      current.titles.push(row.submission.title);
    }
    index.set(row.participantId, current);
  }
  return index;
}

/**
 * `B-1`. Every participant × every task assigned to them, with status, deadline and lateness.
 * Completed rows are returned too — the surface filters them out by default but needs them to show
 * a completion rate, and a report that can only prove absence is the gap Sessionboard has.
 */
export async function listTaskCompletion(
  ctx: EventContext,
  now = new Date(),
): Promise<OutstandingTaskRow[]> {
  requireCapability(ctx, 'submission:read_all');
  const db = getDb();

  const [rows, accepted] = await Promise.all([
    db
      .select({ assignment: taskAssignment, task, participant, account: user })
      .from(taskAssignment)
      .innerJoin(task, eq(taskAssignment.taskId, task.id))
      .innerJoin(participant, eq(taskAssignment.participantId, participant.id))
      .innerJoin(user, eq(participant.userId, user.id))
      .where(eq(task.eventId, ctx.eventId)),
    acceptedIndex(ctx.eventId),
  ]);

  const stamp = now.getTime();

  return sortOutstanding(
    rows.map((row) => {
      const due = row.task.dueAt;
      const urgency = classifyUrgency(row.assignment.status, due, stamp);
      const link = accepted.get(row.participant.id);
      return {
        id: row.assignment.id,
        participantId: row.participant.id,
        participantName: displayNameOf(row.participant, row.account),
        participantEmail: row.account.email,
        company: row.participant.company,
        accepted: link?.accepted ?? false,
        sessionTitles: link?.titles ?? [],
        taskId: row.task.id,
        taskName: row.task.name,
        taskKind: row.task.kind,
        required: row.task.required,
        status: row.assignment.status,
        dueAt: due ? due.toISOString() : null,
        daysOverdue: due && due.getTime() < stamp ? wholeDays(due.getTime(), stamp) : null,
        daysUntilDue: due && due.getTime() >= stamp ? wholeDays(stamp, due.getTime()) : null,
        urgency,
        lastRemindedAt: row.assignment.lastRemindedAt
          ? row.assignment.lastRemindedAt.toISOString()
          : null,
      };
    }),
  );
}

export type TaskCompletionSummary = {
  assignments: number;
  outstanding: number;
  overdue: number;
  dueSoon: number;
  completed: number;
  waived: number;
  blockedSpeakers: number;
  completionPct: number;
};

export function summarizeTaskCompletion(rows: OutstandingTaskRow[]): TaskCompletionSummary {
  const overdue = rows.filter((row) => row.urgency === 'overdue');
  const dueSoon = rows.filter((row) => row.urgency === 'due_soon');
  const completed = rows.filter((row) => row.status === 'completed');
  const waived = rows.filter((row) => row.status === 'waived');
  const outstanding = rows.filter((row) => row.urgency !== 'done');
  const settled = completed.length + waived.length;

  return {
    assignments: rows.length,
    outstanding: outstanding.length,
    overdue: overdue.length,
    dueSoon: dueSoon.length,
    completed: completed.length,
    waived: waived.length,
    blockedSpeakers: new Set(outstanding.map((row) => row.participantId)).size,
    completionPct: rows.length === 0 ? 0 : Math.round((settled / rows.length) * 100),
  };
}

// ---------------------------------------------------------------------------
// `B-2` counters
// ---------------------------------------------------------------------------

export type Counters = {
  submissions: number;
  byStatus: Record<SubmissionStatusValue, number>;
  acceptedSpeakers: number;
  participants: number;
  sessions: number;
  publishedSessions: number;
  scheduledSessions: number;
};

const EMPTY_STATUS: Record<SubmissionStatusValue, number> = {
  draft: 0,
  submitted: 0,
  under_review: 0,
  accepted: 0,
  declined: 0,
  waitlisted: 0,
  withdrawn: 0,
};

export async function loadCounters(ctx: EventContext): Promise<Counters> {
  requireCapability(ctx, 'submission:read_all');
  const db = getDb();

  const [submissions, participants, sessions, accepted] = await Promise.all([
    db.query.submission.findMany({ where: eq(submission.eventId, ctx.eventId) }),
    db.query.participant.findMany({ where: eq(participant.eventId, ctx.eventId) }),
    db.query.scheduledSession.findMany({ where: eq(scheduledSession.eventId, ctx.eventId) }),
    acceptedIndex(ctx.eventId),
  ]);

  const byStatus = { ...EMPTY_STATUS };
  for (const row of submissions) byStatus[row.status] += 1;

  return {
    submissions: submissions.length,
    byStatus,
    acceptedSpeakers: [...accepted.values()].filter((entry) => entry.accepted).length,
    participants: participants.length,
    sessions: sessions.length,
    publishedSessions: sessions.filter((row) => row.status === 'published').length,
    scheduledSessions: sessions.filter((row) => row.startsAt !== null).length,
  };
}

// ---------------------------------------------------------------------------
// `B-3` nudges
// ---------------------------------------------------------------------------

export type Nudge = {
  id: string;
  label: string;
  count: number;
  href: string;
  tone: 'danger' | 'warning' | 'info';
};

export async function loadNudges(ctx: EventContext, now = new Date()): Promise<Nudge[]> {
  requireCapability(ctx, 'submission:read_all');
  const db = getDb();

  const [submissions, sessions, participants, assignments] = await Promise.all([
    db.query.submission.findMany({ where: eq(submission.eventId, ctx.eventId) }),
    db.query.scheduledSession.findMany({ where: eq(scheduledSession.eventId, ctx.eventId) }),
    db.query.participant.findMany({ where: eq(participant.eventId, ctx.eventId) }),
    listTaskCompletion(ctx, now),
  ]);

  const acceptedIds = new Set(
    submissions.filter((row) => row.status === 'accepted').map((row) => row.id),
  );
  const scheduledSubmissionIds = new Set(
    sessions.filter((row) => row.submissionId).map((row) => row.submissionId as string),
  );

  const needsSlot = sessions.filter((row) => row.startsAt === null).length;
  const acceptedWithoutSession = [...acceptedIds].filter(
    (id) => !scheduledSubmissionIds.has(id),
  ).length;
  const missingProfile = participants.filter(
    (row) => !row.bioMarkdown?.trim() || !row.headshotFileId,
  ).length;
  const awaitingReview = submissions.filter(
    (row) => row.status === 'submitted' || row.status === 'under_review',
  ).length;
  const overdue = assignments.filter((row) => row.urgency === 'overdue').length;
  const unpublished = sessions.filter((row) => row.status === 'draft').length;

  const nudges: Nudge[] = [
    {
      id: 'overdue-tasks',
      label: 'overdue speaker tasks',
      count: overdue,
      href: '/admin/tasks',
      tone: 'danger',
    },
    {
      id: 'needs-slot',
      label: 'sessions still need a time slot',
      count: needsSlot,
      href: '/admin/agenda',
      tone: 'warning',
    },
    {
      id: 'accepted-unscheduled',
      label: 'accepted talks are not on the agenda yet',
      count: acceptedWithoutSession,
      href: '/admin/agenda',
      tone: 'warning',
    },
    {
      id: 'missing-profile',
      label: 'speakers are missing a bio or headshot',
      count: missingProfile,
      href: '/admin/speakers',
      tone: 'warning',
    },
    {
      id: 'awaiting-review',
      label: 'submissions are still awaiting a decision',
      count: awaitingReview,
      href: '/admin/submissions',
      tone: 'info',
    },
    {
      id: 'unpublished',
      label: 'sessions are drafts and stay out of the public embeds',
      count: unpublished,
      href: '/admin/agenda',
      tone: 'info',
    },
  ];

  return nudges.filter((nudge) => nudge.count > 0);
}

// ---------------------------------------------------------------------------
// `B-6` pacing
// ---------------------------------------------------------------------------

export type PacingPoint = { date: string; dayIndex: number; count: number; cumulative: number };
export type PacingSeries = {
  eventId: string;
  eventName: string;
  total: number;
  points: PacingPoint[];
};

function dayKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

async function pacingFor(eventId: string, eventName: string): Promise<PacingSeries> {
  const rows = await getDb().query.submission.findMany({
    where: eq(submission.eventId, eventId),
  });

  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.status === 'draft') continue;
    const stamp = row.submittedAt ?? row.createdAt;
    const key = dayKey(stamp);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const ordered = [...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const first = ordered[0]?.[0];
  let cumulative = 0;

  const points = ordered.map(([date, count]) => {
    cumulative += count;
    return {
      date,
      dayIndex: first ? Math.round((Date.parse(date) - Date.parse(first)) / DAY_MS) : 0,
      count,
      cumulative,
    };
  });

  return { eventId, eventName, total: cumulative, points };
}

/**
 * `B-6`. The comparison series is aligned on `dayIndex` — days since that edition's first
 * submission — because two editions never share calendar dates and a date-aligned chart of them
 * says nothing.
 */
export async function loadPacing(
  ctx: EventContext,
  compareEventId?: string | null,
): Promise<{ current: PacingSeries; compare: PacingSeries | null }> {
  requireCapability(ctx, 'submission:read_all');
  const db = getDb();

  const ids = compareEventId ? [ctx.eventId, compareEventId] : [ctx.eventId];
  const events = await db.query.event.findMany({ where: inArray(event.id, ids) });
  const nameOf = (id: string) => events.find((row) => row.id === id)?.name ?? 'Event';

  const current = await pacingFor(ctx.eventId, nameOf(ctx.eventId));
  const compare =
    compareEventId && compareEventId !== ctx.eventId
      ? await pacingFor(compareEventId, nameOf(compareEventId))
      : null;

  return { current, compare };
}

// ---------------------------------------------------------------------------
// `B-7` breakdowns
// ---------------------------------------------------------------------------

export type Breakdown = {
  id: string;
  label: string;
  total: number;
  accepted: number;
  pending: number;
  declined: number;
  drafts: number;
};

function emptyBreakdown(id: string, label: string): Breakdown {
  return { id, label, total: 0, accepted: 0, pending: 0, declined: 0, drafts: 0 };
}

function tally(bucket: Breakdown, status: SubmissionStatusValue): void {
  bucket.total += 1;
  if (status === 'accepted') bucket.accepted += 1;
  else if (status === 'declined' || status === 'withdrawn') bucket.declined += 1;
  else if (status === 'draft') bucket.drafts += 1;
  else bucket.pending += 1;
}

export async function loadBreakdowns(
  ctx: EventContext,
): Promise<{ byForm: Breakdown[]; byTrack: Breakdown[] }> {
  requireCapability(ctx, 'submission:read_all');
  const db = getDb();

  const [submissions, forms, tracks] = await Promise.all([
    db.query.submission.findMany({ where: eq(submission.eventId, ctx.eventId) }),
    db.query.form.findMany({ where: eq(form.eventId, ctx.eventId) }),
    db.query.track.findMany({ where: eq(track.eventId, ctx.eventId) }),
  ]);

  const byForm = new Map(forms.map((row) => [row.id, emptyBreakdown(row.id, row.name)]));
  const byTrack = new Map(tracks.map((row) => [row.id, emptyBreakdown(row.id, row.name)]));
  byTrack.set('none', emptyBreakdown('none', 'No track'));

  for (const row of submissions) {
    const formBucket = byForm.get(row.formId);
    if (formBucket) tally(formBucket, row.status);
    const trackBucket = byTrack.get(row.trackId ?? 'none');
    if (trackBucket) tally(trackBucket, row.status);
  }

  return {
    byForm: [...byForm.values()].sort((a, b) => b.total - a.total),
    byTrack: [...byTrack.values()].filter((row) => row.total > 0).sort((a, b) => b.total - a.total),
  };
}

// ---------------------------------------------------------------------------
// Review progress and schedule health (`B-4` panels)
// ---------------------------------------------------------------------------

export type ReviewRoundProgress = {
  id: string;
  name: string;
  status: string;
  assigned: number;
  completed: number;
  pending: number;
  declined: number;
  reviewers: number;
  submissions: number;
  completionPct: number;
};

export async function loadReviewProgress(ctx: EventContext): Promise<ReviewRoundProgress[]> {
  requireCapability(ctx, 'submission:read_all');
  const db = getDb();

  const rounds = await db.query.reviewRound.findMany({
    where: eq(reviewRound.eventId, ctx.eventId),
  });
  if (rounds.length === 0) return [];

  const assignments = await db
    .select({ assignment: reviewAssignment })
    .from(reviewAssignment)
    .where(
      inArray(
        reviewAssignment.reviewRoundId,
        rounds.map((row) => row.id),
      ),
    );

  return rounds.map((round) => {
    const mine = assignments
      .map((row) => row.assignment)
      .filter((row) => row.reviewRoundId === round.id);
    const completed = mine.filter((row) => row.status === 'completed').length;
    return {
      id: round.id,
      name: round.name,
      status: round.status,
      assigned: mine.length,
      completed,
      pending: mine.filter((row) => row.status === 'pending').length,
      declined: mine.filter((row) => row.status === 'declined').length,
      reviewers: new Set(mine.map((row) => row.reviewerUserId)).size,
      submissions: new Set(mine.map((row) => row.submissionId)).size,
      completionPct: mine.length === 0 ? 0 : Math.round((completed / mine.length) * 100),
    };
  });
}

export type ScheduleConflict = { roomName: string; first: string; second: string; startsAt: string };

export type ScheduleHealth = {
  total: number;
  published: number;
  draft: number;
  cancelled: number;
  unscheduled: number;
  missingRoom: number;
  acceptedWithoutSession: number;
  conflicts: ScheduleConflict[];
};

export async function loadScheduleHealth(ctx: EventContext): Promise<ScheduleHealth> {
  requireCapability(ctx, 'submission:read_all');
  const db = getDb();

  const [sessions, rooms, submissions] = await Promise.all([
    db.query.scheduledSession.findMany({ where: eq(scheduledSession.eventId, ctx.eventId) }),
    db.query.room.findMany({ where: eq(room.eventId, ctx.eventId) }),
    db.query.submission.findMany({ where: eq(submission.eventId, ctx.eventId) }),
  ]);

  const roomName = new Map(rooms.map((row) => [row.id, row.name]));
  const scheduledIds = new Set(
    sessions.filter((row) => row.submissionId).map((row) => row.submissionId as string),
  );

  const conflicts: ScheduleConflict[] = [];
  const placed = sessions.filter((row) => row.roomId && row.startsAt && row.endsAt);
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) {
      const a = placed[i];
      const b = placed[j];
      if (a.roomId !== b.roomId) continue;
      const aStart = (a.startsAt as Date).getTime();
      const aEnd = (a.endsAt as Date).getTime();
      const bStart = (b.startsAt as Date).getTime();
      const bEnd = (b.endsAt as Date).getTime();
      if (aStart < bEnd && bStart < aEnd) {
        conflicts.push({
          roomName: roomName.get(a.roomId as string) ?? 'Unassigned room',
          first: a.title,
          second: b.title,
          startsAt: (a.startsAt as Date).toISOString(),
        });
      }
    }
  }

  return {
    total: sessions.length,
    published: sessions.filter((row) => row.status === 'published').length,
    draft: sessions.filter((row) => row.status === 'draft').length,
    cancelled: sessions.filter((row) => row.status === 'cancelled').length,
    unscheduled: sessions.filter((row) => !row.startsAt).length,
    missingRoom: sessions.filter((row) => !row.roomId).length,
    acceptedWithoutSession: submissions.filter(
      (row) => row.status === 'accepted' && !scheduledIds.has(row.id),
    ).length,
    conflicts,
  };
}

// ---------------------------------------------------------------------------
// Speaker tracking and the admin task list
// ---------------------------------------------------------------------------

export type SpeakerRow = {
  id: string;
  name: string;
  email: string;
  pronouns: string | null;
  jobTitle: string | null;
  company: string | null;
  hasBio: boolean;
  hasHeadshot: boolean;
  linkCount: number;
  submissions: number;
  acceptedSessions: string[];
  tasksTotal: number;
  tasksDone: number;
  tasksOverdue: number;
};

export async function listSpeakers(ctx: EventContext, now = new Date()): Promise<SpeakerRow[]> {
  requireCapability(ctx, 'submission:read_all');
  const db = getDb();

  const [people, roles, assignments] = await Promise.all([
    db
      .select({ participant, account: user })
      .from(participant)
      .innerJoin(user, eq(participant.userId, user.id))
      .where(eq(participant.eventId, ctx.eventId)),
    db
      .select({ participantId: participantRole.participantId, submission })
      .from(participantRole)
      .innerJoin(submission, eq(participantRole.submissionId, submission.id))
      .where(eq(submission.eventId, ctx.eventId)),
    listTaskCompletion(ctx, now),
  ]);

  return people
    .map((row) => {
      const mine = roles.filter((entry) => entry.participantId === row.participant.id);
      const tasks = assignments.filter((entry) => entry.participantId === row.participant.id);
      return {
        id: row.participant.id,
        name: displayNameOf(row.participant, row.account),
        email: row.account.email,
        pronouns: row.participant.pronouns,
        jobTitle: row.participant.jobTitle,
        company: row.participant.company,
        hasBio: Boolean(row.participant.bioMarkdown?.trim()),
        hasHeadshot: Boolean(row.participant.headshotFileId),
        linkCount: row.participant.links.length,
        submissions: mine.length,
        acceptedSessions: mine
          .filter((entry) => entry.submission.status === 'accepted')
          .map((entry) => entry.submission.title),
        tasksTotal: tasks.length,
        tasksDone: tasks.filter((entry) => entry.urgency === 'done').length,
        tasksOverdue: tasks.filter((entry) => entry.urgency === 'overdue').length,
      };
    })
    .sort((a, b) => b.tasksOverdue - a.tasksOverdue || a.name.localeCompare(b.name));
}

export type AdminTaskRow = {
  id: string;
  name: string;
  kind: TaskKindValue;
  audience: (typeof task.$inferSelect)['audience'];
  required: boolean;
  dueAt: string | null;
  assigned: number;
  notStarted: number;
  inProgress: number;
  completed: number;
  waived: number;
  overdue: number;
  completionPct: number;
};

export async function listTasksForAdmin(
  ctx: EventContext,
  now = new Date(),
): Promise<AdminTaskRow[]> {
  requireCapability(ctx, 'submission:read_all');
  const db = getDb();

  const [tasks, assignments] = await Promise.all([
    db.query.task.findMany({ where: eq(task.eventId, ctx.eventId) }),
    listTaskCompletion(ctx, now),
  ]);

  return tasks
    .map((row) => {
      const mine = assignments.filter((entry) => entry.taskId === row.id);
      const settled = mine.filter(
        (entry) => entry.status === 'completed' || entry.status === 'waived',
      ).length;
      return {
        id: row.id,
        name: row.name,
        kind: row.kind,
        audience: row.audience,
        required: row.required,
        dueAt: row.dueAt ? row.dueAt.toISOString() : null,
        assigned: mine.length,
        notStarted: mine.filter((entry) => entry.status === 'not_started').length,
        inProgress: mine.filter((entry) => entry.status === 'in_progress').length,
        completed: mine.filter((entry) => entry.status === 'completed').length,
        waived: mine.filter((entry) => entry.status === 'waived').length,
        overdue: mine.filter((entry) => entry.urgency === 'overdue').length,
        completionPct: mine.length === 0 ? 0 : Math.round((settled / mine.length) * 100),
      };
    })
    .sort((a, b) => b.overdue - a.overdue || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// `B-8` reports
// ---------------------------------------------------------------------------

export type ReportId = 'outstanding-tasks' | 'task-completion' | 'speakers' | 'submissions';

export const REPORTS: { id: ReportId; name: string; description: string }[] = [
  {
    id: 'outstanding-tasks',
    name: 'Outstanding speaker tasks',
    description: 'One row per person per unfinished task, worst overdue first.',
  },
  {
    id: 'task-completion',
    name: 'Task completion',
    description: 'Every assignment including the finished ones, for a completion rate.',
  },
  {
    id: 'speakers',
    name: 'Speaker roster',
    description: 'Profile completeness, accepted sessions and task progress per speaker.',
  },
  {
    id: 'submissions',
    name: 'Submission pipeline',
    description: 'Every submission with its form, track, status and decision date.',
  },
];

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export async function buildReport(ctx: EventContext, report: ReportId): Promise<string> {
  requireCapability(ctx, 'submission:read_all');

  if (report === 'outstanding-tasks' || report === 'task-completion') {
    const all = await listTaskCompletion(ctx);
    const rows = report === 'outstanding-tasks' ? all.filter((r) => r.urgency !== 'done') : all;
    return toCsv([
      [
        'Speaker',
        'Email',
        'Company',
        'Accepted',
        'Task',
        'Kind',
        'Required',
        'Status',
        'Due',
        'Days overdue',
      ],
      ...rows.map((row) => [
        row.participantName,
        row.participantEmail,
        row.company,
        row.accepted ? 'yes' : 'no',
        row.taskName,
        row.taskKind,
        row.required ? 'yes' : 'no',
        row.status,
        row.dueAt?.slice(0, 10) ?? '',
        row.daysOverdue ?? '',
      ]),
    ]);
  }

  if (report === 'speakers') {
    const rows = await listSpeakers(ctx);
    return toCsv([
      [
        'Name',
        'Email',
        'Job title',
        'Company',
        'Bio',
        'Headshot',
        'Submissions',
        'Accepted sessions',
        'Tasks done',
        'Tasks total',
        'Overdue',
      ],
      ...rows.map((row) => [
        row.name,
        row.email,
        row.jobTitle,
        row.company,
        row.hasBio ? 'yes' : 'no',
        row.hasHeadshot ? 'yes' : 'no',
        row.submissions,
        row.acceptedSessions.join(' | '),
        row.tasksDone,
        row.tasksTotal,
        row.tasksOverdue,
      ]),
    ]);
  }

  const db = getDb();
  const [submissions, forms, tracks] = await Promise.all([
    db.query.submission.findMany({ where: eq(submission.eventId, ctx.eventId) }),
    db.query.form.findMany({ where: eq(form.eventId, ctx.eventId) }),
    db.query.track.findMany({ where: eq(track.eventId, ctx.eventId) }),
  ]);
  const formName = new Map(forms.map((row) => [row.id, row.name]));
  const trackName = new Map(tracks.map((row) => [row.id, row.name]));

  return toCsv([
    ['Ref', 'Title', 'Form', 'Track', 'Status', 'Submitted', 'Decided'],
    ...submissions.map((row) => [
      `ABS-${row.ref}`,
      row.title,
      formName.get(row.formId) ?? '',
      row.trackId ? (trackName.get(row.trackId) ?? '') : '',
      row.status,
      row.submittedAt?.toISOString().slice(0, 10) ?? '',
      row.decidedAt?.toISOString().slice(0, 10) ?? '',
    ]),
  ]);
}

// ---------------------------------------------------------------------------
// `B-4`/`B-5` widget catalog. A prebuilt dashboard is a named widget list, and a custom one is a
// user-owned list in `saved_view` — same renderer, so a new widget appears in both at once.
// ---------------------------------------------------------------------------

export type WidgetId =
  | 'counters'
  | 'nudges'
  | 'outstanding'
  | 'status-breakdown'
  | 'pacing'
  | 'by-form'
  | 'by-track'
  | 'review-progress'
  | 'schedule-health'
  | 'speaker-tracking'
  | 'reports';

export const WIDGETS: { id: WidgetId; name: string; description: string }[] = [
  { id: 'counters', name: 'Counters', description: 'Submissions, speakers, sessions.' },
  { id: 'nudges', name: 'Next actions', description: 'What is blocking the program right now.' },
  {
    id: 'outstanding',
    name: 'Outstanding tasks',
    description: 'Who owes what, overdue first.',
  },
  {
    id: 'status-breakdown',
    name: 'Status breakdown',
    description: 'Accepted / pending / declined / drafts / withdrawn.',
  },
  { id: 'pacing', name: 'Submission pacing', description: 'Arrivals over time, with a comparison.' },
  { id: 'by-form', name: 'By form', description: 'Volume and acceptance per form.' },
  { id: 'by-track', name: 'By track', description: 'Volume and acceptance per track.' },
  { id: 'review-progress', name: 'Review progress', description: 'Scoring completion per round.' },
  {
    id: 'schedule-health',
    name: 'Schedule health',
    description: 'Unscheduled talks, missing rooms, room clashes.',
  },
  {
    id: 'speaker-tracking',
    name: 'Speaker tracking',
    description: 'Profile completeness and task progress.',
  },
  { id: 'reports', name: 'Reports', description: 'CSV exports.' },
];

export const PREBUILT_DASHBOARDS: {
  id: string;
  name: string;
  description: string;
  widgets: WidgetId[];
}[] = [
  {
    id: 'event-overview',
    name: 'Event Overview',
    description: 'The whole program in one screen.',
    widgets: ['counters', 'nudges', 'outstanding', 'status-breakdown'],
  },
  {
    id: 'submissions-pipeline',
    name: 'Submissions Pipeline',
    description: 'Where the content is coming from and how fast.',
    widgets: ['status-breakdown', 'pacing', 'by-form', 'by-track'],
  },
  {
    id: 'speaker-tracking',
    name: 'Speaker Tracking',
    description: 'Onboarding state for every confirmed speaker.',
    widgets: ['outstanding', 'speaker-tracking', 'reports'],
  },
  {
    id: 'review-progress',
    name: 'Review Progress',
    description: 'How far each scoring round has got.',
    widgets: ['review-progress', 'status-breakdown'],
  },
  {
    id: 'schedule-health',
    name: 'Schedule Health',
    description: 'Everything that would break the printed agenda.',
    widgets: ['schedule-health', 'counters', 'nudges'],
  },
];

export function isWidgetId(value: string): value is WidgetId {
  return WIDGETS.some((widget) => widget.id === value);
}
