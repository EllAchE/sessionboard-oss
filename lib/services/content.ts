import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../../db/client';
import {
  contentRevision,
  event,
  file,
  fileRequest,
  participant,
  submission,
  task,
  taskAssignment,
  user,
} from '../../db/schema';
import type { EventContext } from '../context';
import { can, requireCapability } from '../context';
import { appUrl } from '../env';
import { forbidden, invalid, notFound } from '../errors';
import { formatRef } from '../ids';
import { sendMail } from '../mail';
import { markdownToText, renderMarkdown } from '../markdown';
import {
  countCommentsByLineage,
  getFileRecord,
  lineageIdOf,
  supersedeFile,
  validateUpload,
  type FileRecord,
  type FileRequestSpec,
  type UploadInput,
} from './files';
import { FILE_IDS_KEY, type TaskStatus } from './tasks';

/**
 * `CNT-03`, `CNT-04`, `CNT-11`. Deliverables and the edit history behind them. Both live here rather
 * than in `files.ts` because both span three tables the file service has no business owning — a
 * deliverable is a task assignment that happens to hold bytes, and a revision is a snapshot of a
 * submission or a participant.
 */

// ---------------------------------------------------------------------------
// `CNT-03` deliverable status per speaker and session
// ---------------------------------------------------------------------------

export type DeliverableState = 'submitted' | 'outstanding' | 'waived';

export type DeliverableFile = {
  id: string;
  filename: string;
  sizeBytes: number;
  contentType: string;
  version: number;
  versionCount: number;
  commentCount: number;
  createdAt: Date;
};

export type DeliverableRow = {
  assignmentId: string;
  participantId: string;
  speakerName: string;
  speakerEmail: string;
  taskId: string;
  taskName: string;
  required: boolean;
  dueAt: Date | null;
  overdue: boolean;
  status: TaskStatus;
  state: DeliverableState;
  submissionId: string | null;
  submissionRef: string | null;
  submissionTitle: string | null;
  request: FileRequestSpec | null;
  files: DeliverableFile[];
  lastRemindedAt: Date | null;
};

function fileIdsOf(answers: Record<string, unknown> | null): string[] {
  const raw = answers?.[FILE_IDS_KEY];
  return Array.isArray(raw) ? raw.filter((entry): entry is string => typeof entry === 'string') : [];
}

/**
 * One row per speaker per asked-for file, whether or not anything arrived. The outstanding half is
 * the half that matters: a table of what has been received answers no question an organizer chasing
 * a deadline actually has.
 */
export async function listDeliverableStatus(ctx: EventContext): Promise<DeliverableRow[]> {
  requireCapability(ctx, 'submission:read_all');
  const db = getDb();

  const rows = await db
    .select({
      assignment: taskAssignment,
      task,
      request: fileRequest,
      participantId: participant.id,
      displayName: participant.displayName,
      userName: user.name,
      email: user.email,
    })
    .from(taskAssignment)
    .innerJoin(task, eq(task.id, taskAssignment.taskId))
    .innerJoin(participant, eq(participant.id, taskAssignment.participantId))
    .innerJoin(user, eq(user.id, participant.userId))
    .leftJoin(fileRequest, eq(fileRequest.id, task.fileRequestId))
    .where(and(eq(task.eventId, ctx.eventId), eq(task.kind, 'file_upload')))
    .orderBy(asc(task.position), asc(user.email));

  const wantedIds = [...new Set(rows.flatMap((row) => fileIdsOf(row.assignment.answers)))];
  const records = wantedIds.length
    ? await db
        .select()
        .from(file)
        .where(and(eq(file.eventId, ctx.eventId), inArray(file.id, wantedIds)))
    : [];

  const lineages = await db.select().from(file).where(eq(file.eventId, ctx.eventId));
  const versionCounts = new Map<string, number>();
  const topVersions = new Map<string, number>();
  for (const record of lineages) {
    const root = lineageIdOf(record);
    versionCounts.set(root, (versionCounts.get(root) ?? 0) + 1);
    topVersions.set(root, Math.max(topVersions.get(root) ?? 0, record.version));
  }
  const currentByLineage = new Map<string, FileRecord>();
  for (const record of lineages) {
    const root = lineageIdOf(record);
    if (record.version === topVersions.get(root)) currentByLineage.set(root, record);
  }

  const commentCounts = await countCommentsByLineage(ctx.eventId);
  const recordById = new Map(records.map((record) => [record.id, record]));

  const submissionIds = [
    ...new Set(
      rows.map((row) => row.assignment.submissionId).filter((id): id is string => Boolean(id)),
    ),
  ];
  const submissions = submissionIds.length
    ? await db
        .select({ id: submission.id, ref: submission.ref, title: submission.title })
        .from(submission)
        .where(inArray(submission.id, submissionIds))
    : [];
  const submissionById = new Map(submissions.map((row) => [row.id, row]));

  const now = Date.now();
  return rows.map((row) => {
    const stored = fileIdsOf(row.assignment.answers)
      .map((id) => recordById.get(id))
      .filter((record): record is FileRecord => Boolean(record));

    const files: DeliverableFile[] = stored.map((record) => {
      const root = lineageIdOf(record);
      const current = currentByLineage.get(root) ?? record;
      return {
        id: current.id,
        filename: current.filename,
        sizeBytes: current.sizeBytes,
        contentType: current.contentType,
        version: current.version,
        versionCount: versionCounts.get(root) ?? 1,
        commentCount: commentCounts.get(root) ?? 0,
        createdAt: current.createdAt,
      };
    });

    const parent = row.assignment.submissionId
      ? submissionById.get(row.assignment.submissionId)
      : undefined;
    const state: DeliverableState =
      row.assignment.status === 'waived' ? 'waived' : files.length > 0 ? 'submitted' : 'outstanding';

    return {
      assignmentId: row.assignment.id,
      participantId: row.participantId,
      speakerName: row.displayName ?? row.userName ?? row.email,
      speakerEmail: row.email,
      taskId: row.task.id,
      taskName: row.task.name,
      required: row.task.required,
      dueAt: row.task.dueAt,
      overdue: state === 'outstanding' && Boolean(row.task.dueAt && row.task.dueAt.getTime() < now),
      status: row.assignment.status,
      state,
      submissionId: parent?.id ?? null,
      submissionRef: parent ? formatRef('submission', parent.ref) : null,
      submissionTitle: parent?.title ?? null,
      request: row.request
        ? {
            id: row.request.id,
            label: row.request.label,
            helpText: row.request.helpText,
            acceptedTypes: row.request.acceptedTypes ?? [],
            maxSizeMb: row.request.maxSizeMb,
            allowMultiple: row.request.allowMultiple,
          }
        : null,
      files,
      lastRemindedAt: row.assignment.lastRemindedAt,
    };
  });
}

export type DeliverableSummary = {
  total: number;
  submitted: number;
  outstanding: number;
  waived: number;
  overdue: number;
  speakersMissing: number;
};

export function summarizeDeliverables(rows: DeliverableRow[]): DeliverableSummary {
  const outstanding = rows.filter((row) => row.state === 'outstanding');
  return {
    total: rows.length,
    submitted: rows.filter((row) => row.state === 'submitted').length,
    outstanding: outstanding.length,
    waived: rows.filter((row) => row.state === 'waived').length,
    overdue: rows.filter((row) => row.overdue).length,
    speakersMissing: new Set(outstanding.map((row) => row.participantId)).size,
  };
}

export type ChaseResult = { sent: number; skipped: string[] };

/**
 * `CNT-03`'s second half. A chase names the exact file and its rules, because "you still owe us
 * something" is the reminder speakers ignore. Every send lands in `email_log`, so an organizer can
 * prove the nudge happened without waiting on a mail server.
 */
export async function chaseDeliverables(
  ctx: EventContext,
  assignmentIds: string[],
): Promise<ChaseResult> {
  requireCapability(ctx, 'task:manage');
  if (assignmentIds.length === 0) throw invalid('Pick at least one outstanding deliverable');

  const rows = (await listDeliverableStatus(ctx)).filter((row) =>
    assignmentIds.includes(row.assignmentId),
  );
  const [eventRow] = await getDb()
    .select({ slug: event.slug, name: event.name })
    .from(event)
    .where(eq(event.id, ctx.eventId));
  if (!eventRow) throw notFound('That event');

  const portalLink = `${appUrl()}/portal/${eventRow.slug}/files`;
  const skipped: string[] = [];
  let sent = 0;

  for (const row of rows) {
    if (row.state !== 'outstanding') {
      skipped.push(`${row.speakerName} — ${row.taskName} is already ${row.state}`);
      continue;
    }

    const rules = row.request
      ? `Accepted: ${row.request.acceptedTypes.length > 0 ? row.request.acceptedTypes.join(', ') : 'any file type'}, up to ${row.request.maxSizeMb} MB.`
      : '';
    const due = row.dueAt ? ` It was due ${row.dueAt.toISOString().slice(0, 10)}.` : '';
    const body = [
      `Hi ${row.speakerName},`,
      '',
      `We are still missing **${row.taskName}** for ${eventRow.name}.${due}`,
      rules,
      '',
      `[Upload it in your speaker portal](${portalLink})`,
    ]
      .filter((line) => line !== '')
      .join('\n');

    await sendMail({
      to: row.speakerEmail,
      subject: `Still needed: ${row.taskName}`,
      html: renderMarkdown(body),
      text: markdownToText(body).replace('Upload it in your speaker portal', portalLink),
      eventId: ctx.eventId,
      templateKey: 'deliverable.chase',
    });

    await getDb()
      .update(taskAssignment)
      .set({ lastRemindedAt: new Date() })
      .where(eq(taskAssignment.id, row.assignmentId));
    sent += 1;
  }

  return { sent, skipped };
}

// ---------------------------------------------------------------------------
// `CNT-04` replacing a deliverable in place
// ---------------------------------------------------------------------------

type DeliverableOwner = {
  participantId: string | null;
  spec: FileRequestSpec | null;
};

async function ownerOf(eventId: string, record: FileRecord): Promise<DeliverableOwner> {
  const db = getDb();
  const lineage = lineageIdOf(record);
  const ids = (
    await db
      .select({ id: file.id, rootFileId: file.rootFileId })
      .from(file)
      .where(eq(file.eventId, eventId))
  )
    .filter((row) => (row.rootFileId ?? row.id) === lineage)
    .map((row) => row.id);

  const assignments = await db
    .select({ assignment: taskAssignment, task, request: fileRequest })
    .from(taskAssignment)
    .innerJoin(task, eq(task.id, taskAssignment.taskId))
    .innerJoin(participant, eq(participant.id, taskAssignment.participantId))
    .leftJoin(fileRequest, eq(fileRequest.id, task.fileRequestId))
    .where(eq(task.eventId, eventId));

  const owning = assignments.find((row) =>
    fileIdsOf(row.assignment.answers).some((id) => ids.includes(id)),
  );
  if (owning) {
    return {
      participantId: owning.assignment.participantId,
      spec: owning.request
        ? {
            id: owning.request.id,
            label: owning.request.label,
            helpText: owning.request.helpText,
            acceptedTypes: owning.request.acceptedTypes ?? [],
            maxSizeMb: owning.request.maxSizeMb,
            allowMultiple: owning.request.allowMultiple,
          }
        : null,
    };
  }

  if (ids.length === 0) return { participantId: null, spec: null };
  const [headshot] = await db
    .select({ id: participant.id })
    .from(participant)
    .where(and(eq(participant.eventId, eventId), inArray(participant.headshotFileId, ids)));
  return { participantId: headshot?.id ?? null, spec: null };
}

/**
 * Uploads a replacement and repoints everything that named the old row at the new one. Without the
 * repointing the ZIP export and the dashboard would keep handing out the version the organizer
 * already rejected, which is a worse failure than not versioning at all.
 */
export async function replaceDeliverable(
  ctx: EventContext,
  fileId: string,
  input: UploadInput,
): Promise<FileRecord> {
  const previous = await getFileRecord(ctx.eventId, fileId);
  const owner = await ownerOf(ctx.eventId, previous);

  if (!can(ctx, 'task:manage')) {
    const [mine] = await getDb()
      .select({ id: participant.id })
      .from(participant)
      .where(
        and(eq(participant.eventId, ctx.eventId), eq(participant.userId, ctx.actor.userId)),
      );
    if (!owner.participantId || owner.participantId !== mine?.id) {
      throw forbidden('That deliverable belongs to someone else');
    }
  }

  if (owner.spec) validateUpload(owner.spec, input);

  const next = await supersedeFile(ctx, previous.id, input);
  await repoint(ctx.eventId, previous.id, next.id);
  return next;
}

async function repoint(eventId: string, previousId: string, nextId: string): Promise<void> {
  const db = getDb();

  const assignments = await db
    .select({ assignment: taskAssignment })
    .from(taskAssignment)
    .innerJoin(participant, eq(participant.id, taskAssignment.participantId))
    .where(eq(participant.eventId, eventId));

  for (const { assignment } of assignments) {
    const ids = fileIdsOf(assignment.answers);
    const holdsFile = ids.includes(previousId);
    const holdsPointer = assignment.fileId === previousId;
    if (!holdsFile && !holdsPointer) continue;

    await db
      .update(taskAssignment)
      .set({
        answers: holdsFile
          ? { ...(assignment.answers ?? {}), [FILE_IDS_KEY]: ids.map((id) => (id === previousId ? nextId : id)) }
          : assignment.answers,
        fileId: holdsPointer ? nextId : assignment.fileId,
        updatedAt: new Date(),
      })
      .where(eq(taskAssignment.id, assignment.id));
  }

  await db
    .update(participant)
    .set({ headshotFileId: nextId, updatedAt: new Date() })
    .where(and(eq(participant.eventId, eventId), eq(participant.headshotFileId, previousId)));

  const submissions = await db
    .select({ id: submission.id, answers: submission.answers })
    .from(submission)
    .where(eq(submission.eventId, eventId));

  for (const row of submissions) {
    let touched = false;
    const answers: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row.answers)) {
      if (value === previousId) {
        answers[key] = nextId;
        touched = true;
      } else if (Array.isArray(value) && value.includes(previousId)) {
        answers[key] = value.map((entry) => (entry === previousId ? nextId : entry));
        touched = true;
      } else {
        answers[key] = value;
      }
    }
    if (touched) {
      await db
        .update(submission)
        .set({ answers, updatedAt: new Date() })
        .where(eq(submission.id, row.id));
    }
  }
}

// ---------------------------------------------------------------------------
// `CNT-11` attributed change history
// ---------------------------------------------------------------------------

export type ContentEntityKind = 'session' | 'participant';

const SESSION_FIELDS: Record<string, string> = {
  title: 'Title',
  descriptionMarkdown: 'Description',
  level: 'Level',
  contentStatus: 'Approval',
  formatId: 'Format',
  trackId: 'Track',
  answers: 'Form answers',
};

const PARTICIPANT_FIELDS: Record<string, string> = {
  displayName: 'Name',
  pronouns: 'Pronouns',
  jobTitle: 'Job title',
  company: 'Company',
  bioMarkdown: 'Bio',
  links: 'Links',
  timezone: 'Timezone',
  dietaryNotes: 'Dietary notes',
  accessibilityNotes: 'Accessibility notes',
};

export function trackedFields(kind: ContentEntityKind): Record<string, string> {
  return kind === 'session' ? SESSION_FIELDS : PARTICIPANT_FIELDS;
}

export type ContentSnapshot = Record<string, unknown>;

function pick(row: Record<string, unknown>, kind: ContentEntityKind): ContentSnapshot {
  const snapshot: ContentSnapshot = {};
  for (const key of Object.keys(trackedFields(kind))) snapshot[key] = row[key] ?? null;
  return snapshot;
}

type EntityState = { snapshot: ContentSnapshot; label: string };

async function readEntity(
  eventId: string,
  kind: ContentEntityKind,
  entityId: string,
): Promise<EntityState> {
  const db = getDb();
  if (kind === 'session') {
    const row = await db.query.submission.findFirst({
      where: and(eq(submission.id, entityId), eq(submission.eventId, eventId)),
    });
    if (!row) throw notFound('That session');
    return { snapshot: pick(row, kind), label: `${formatRef('submission', row.ref)} ${row.title}` };
  }

  const row = await db.query.participant.findFirst({
    where: and(eq(participant.id, entityId), eq(participant.eventId, eventId)),
  });
  if (!row) throw notFound('That speaker');
  return { snapshot: pick(row, kind), label: row.displayName ?? 'Speaker profile' };
}

/**
 * Writes the *current* state, so this runs before the edit lands. A snapshot taken afterwards would
 * record the change rather than the thing you want back.
 */
export async function recordRevision(
  ctx: EventContext,
  kind: ContentEntityKind,
  entityId: string,
  summary: string,
): Promise<void> {
  const { snapshot } = await readEntity(ctx.eventId, kind, entityId);

  /** A save that changed nothing is not history. Without this every "Save" click grows the list. */
  const [latest] = await getDb()
    .select({ snapshot: contentRevision.snapshot })
    .from(contentRevision)
    .where(
      and(
        eq(contentRevision.eventId, ctx.eventId),
        eq(contentRevision.entityKind, kind),
        eq(contentRevision.entityId, entityId),
      ),
    )
    .orderBy(desc(contentRevision.createdAt))
    .limit(1);
  if (latest && diff(kind, latest.snapshot, snapshot).length === 0) return;

  await getDb().insert(contentRevision).values({
    eventId: ctx.eventId,
    entityKind: kind,
    entityId,
    snapshot,
    summary,
    editorUserId: ctx.actor.impersonatedByUserId ?? ctx.actor.userId,
    editorName: editorLabel(ctx),
  });
}

function editorLabel(ctx: EventContext): string {
  const name = ctx.actor.name ?? ctx.actor.email;
  return ctx.actor.impersonatedByUserId ? `${name} (via an organizer)` : name;
}

export type ContentFieldChange = { field: string; label: string; before: string; after: string };

export type ContentRevisionEntry = {
  id: string;
  entityKind: ContentEntityKind;
  entityId: string;
  entityLabel: string;
  summary: string;
  editorUserId: string | null;
  editorName: string;
  createdAt: Date;
  snapshot: ContentSnapshot;
  changed: ContentFieldChange[];
  isCurrent: boolean;
};

/**
 * `CNT-12`. `approved` is the default in the column as well as here, so an event that never opens
 * the control keeps a full public agenda; the gate only bites once someone moves a session off it.
 */
export const CONTENT_APPROVAL_STATUSES = ['in_review', 'approved', 'changes_requested'] as const;

export type ContentApprovalStatus = (typeof CONTENT_APPROVAL_STATUSES)[number];

export const CONTENT_APPROVAL_LABEL: Record<ContentApprovalStatus, string> = {
  in_review: 'In review',
  approved: 'Approved',
  changes_requested: 'Changes requested',
};

function asContentStatus(value: unknown): ContentApprovalStatus {
  return CONTENT_APPROVAL_STATUSES.includes(value as ContentApprovalStatus)
    ? (value as ContentApprovalStatus)
    : 'approved';
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asLinks(value: unknown): { label: string; url: string }[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is { label: string; url: string } =>
      Boolean(entry) &&
      typeof entry === 'object' &&
      typeof (entry as { label?: unknown }).label === 'string' &&
      typeof (entry as { url?: unknown }).url === 'string',
  );
}

function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function diff(
  kind: ContentEntityKind,
  before: ContentSnapshot,
  after: ContentSnapshot,
): ContentFieldChange[] {
  const labels = trackedFields(kind);
  return Object.entries(labels)
    .filter(([field]) => display(before[field]) !== display(after[field]))
    .map(([field, label]) => ({
      field,
      label,
      before: display(before[field]),
      after: display(after[field]),
    }));
}

async function decorate(
  eventId: string,
  rows: (typeof contentRevision.$inferSelect)[],
): Promise<ContentRevisionEntry[]> {
  const byEntity = new Map<string, (typeof contentRevision.$inferSelect)[]>();
  for (const row of rows) {
    const key = `${row.entityKind}:${row.entityId}`;
    byEntity.set(key, [...(byEntity.get(key) ?? []), row]);
  }

  const entries: ContentRevisionEntry[] = [];
  for (const [key, group] of byEntity) {
    const [kind, entityId] = key.split(':') as [ContentEntityKind, string];
    const ordered = [...group].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    let live: EntityState;
    try {
      live = await readEntity(eventId, kind, entityId);
    } catch {
      continue;
    }

    /** Each revision holds the state *before* its edit, so what it changed is the next one along. */
    let after = live.snapshot;
    for (const [index, row] of ordered.entries()) {
      entries.push({
        id: row.id,
        entityKind: kind,
        entityId,
        entityLabel: live.label,
        summary: row.summary,
        editorUserId: row.editorUserId,
        editorName: row.editorName,
        createdAt: row.createdAt,
        snapshot: row.snapshot,
        changed: diff(kind, row.snapshot, after),
        isCurrent: index === 0 && diff(kind, row.snapshot, live.snapshot).length === 0,
      });
      after = row.snapshot;
    }
  }

  return entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function listContentRevisions(
  ctx: EventContext,
  filter: { kind?: ContentEntityKind; entityId?: string; limit?: number } = {},
): Promise<ContentRevisionEntry[]> {
  requireCapability(ctx, 'submission:read_all');
  const clauses = [eq(contentRevision.eventId, ctx.eventId)];
  if (filter.kind) clauses.push(eq(contentRevision.entityKind, filter.kind));
  if (filter.entityId) clauses.push(eq(contentRevision.entityId, filter.entityId));

  const rows = await getDb()
    .select()
    .from(contentRevision)
    .where(and(...clauses))
    .orderBy(desc(contentRevision.createdAt))
    .limit(filter.limit ?? 200);

  return decorate(ctx.eventId, rows);
}

/**
 * The portal's read of the same history. Ownership is the caller's to prove — the portal knows which
 * participant is asking; this layer only refuses to widen the query beyond one entity.
 */
export async function listRevisionsForEntity(
  eventId: string,
  kind: ContentEntityKind,
  entityId: string,
): Promise<ContentRevisionEntry[]> {
  const rows = await getDb()
    .select()
    .from(contentRevision)
    .where(
      and(
        eq(contentRevision.eventId, eventId),
        eq(contentRevision.entityKind, kind),
        eq(contentRevision.entityId, entityId),
      ),
    )
    .orderBy(desc(contentRevision.createdAt));
  return decorate(eventId, rows);
}

/**
 * Restore is itself an edit, so it snapshots first. That is what makes an accidental restore
 * recoverable rather than the one operation in the product that loses work.
 */
export async function restoreContentRevision(
  ctx: EventContext,
  revisionId: string,
): Promise<ContentRevisionEntry> {
  requireCapability(ctx, 'submission:decide');
  const db = getDb();

  const row = await db.query.contentRevision.findFirst({
    where: and(eq(contentRevision.id, revisionId), eq(contentRevision.eventId, ctx.eventId)),
  });
  if (!row) throw notFound('That revision');

  const kind = row.entityKind as ContentEntityKind;
  const { label } = await readEntity(ctx.eventId, kind, row.entityId);
  await recordRevision(
    ctx,
    kind,
    row.entityId,
    `Restored ${label} to the version from ${row.createdAt.toISOString().slice(0, 16).replace('T', ' ')}`,
  );

  const restored = pick(row.snapshot, kind);
  if (kind === 'session') {
    await db
      .update(submission)
      .set({
        title: asText(restored.title) ?? 'Untitled',
        descriptionMarkdown: asText(restored.descriptionMarkdown),
        level: asText(restored.level),
        contentStatus: asContentStatus(restored.contentStatus),
        formatId: asText(restored.formatId),
        trackId: asText(restored.trackId),
        answers: asRecord(restored.answers),
        updatedAt: new Date(),
      })
      .where(and(eq(submission.id, row.entityId), eq(submission.eventId, ctx.eventId)));
  } else {
    await db
      .update(participant)
      .set({
        displayName: asText(restored.displayName),
        pronouns: asText(restored.pronouns),
        jobTitle: asText(restored.jobTitle),
        company: asText(restored.company),
        bioMarkdown: asText(restored.bioMarkdown),
        links: asLinks(restored.links),
        timezone: asText(restored.timezone),
        dietaryNotes: asText(restored.dietaryNotes),
        accessibilityNotes: asText(restored.accessibilityNotes),
        updatedAt: new Date(),
      })
      .where(and(eq(participant.id, row.entityId), eq(participant.eventId, ctx.eventId)));
  }

  const [entry] = await decorate(ctx.eventId, [row]);
  return entry;
}

// ---------------------------------------------------------------------------
// Organizer content edits, snapshotted on the way in
// ---------------------------------------------------------------------------

export type SessionContentPatch = {
  title: string;
  descriptionMarkdown: string;
  level: string;
};

export async function updateSessionContent(
  ctx: EventContext,
  submissionId: string,
  patch: SessionContentPatch,
): Promise<void> {
  requireCapability(ctx, 'submission:decide');
  const title = patch.title.trim();
  if (title.length < 3) throw invalid('A session needs a title', { title: 'Give it a title' });

  const { label } = await readEntity(ctx.eventId, 'session', submissionId);
  await recordRevision(ctx, 'session', submissionId, `Edited ${label}`);

  await getDb()
    .update(submission)
    .set({
      title,
      descriptionMarkdown: patch.descriptionMarkdown.trim() || null,
      level: patch.level.trim() || null,
      updatedAt: new Date(),
    })
    .where(and(eq(submission.id, submissionId), eq(submission.eventId, ctx.eventId)));
}

/**
 * `CNT-12`. Approval is a content decision rather than a scheduling one, so it lands in the same
 * history as every other content edit — "who un-published this session, and when" is the question
 * that gets asked once an agenda entry disappears.
 */
export async function setSessionContentStatus(
  ctx: EventContext,
  submissionId: string,
  status: ContentApprovalStatus,
): Promise<void> {
  requireCapability(ctx, 'submission:decide');
  if (!CONTENT_APPROVAL_STATUSES.includes(status)) throw invalid('That is not an approval state');

  const { label } = await readEntity(ctx.eventId, 'session', submissionId);
  await recordRevision(
    ctx,
    'session',
    submissionId,
    `Set ${label} to ${CONTENT_APPROVAL_LABEL[status]}`,
  );

  await getDb()
    .update(submission)
    .set({ contentStatus: status, updatedAt: new Date() })
    .where(and(eq(submission.id, submissionId), eq(submission.eventId, ctx.eventId)));
}

export type SpeakerContentPatch = {
  displayName: string;
  jobTitle: string;
  company: string;
  bioMarkdown: string;
};

export async function updateSpeakerContent(
  ctx: EventContext,
  participantId: string,
  patch: SpeakerContentPatch,
): Promise<void> {
  requireCapability(ctx, 'submission:decide');
  const { label } = await readEntity(ctx.eventId, 'participant', participantId);
  await recordRevision(ctx, 'participant', participantId, `Edited ${label}`);

  await getDb()
    .update(participant)
    .set({
      displayName: patch.displayName.trim() || null,
      jobTitle: patch.jobTitle.trim() || null,
      company: patch.company.trim() || null,
      bioMarkdown: patch.bioMarkdown.trim() || null,
      updatedAt: new Date(),
    })
    .where(and(eq(participant.id, participantId), eq(participant.eventId, ctx.eventId)));
}

export type EditableEntity = {
  kind: ContentEntityKind;
  id: string;
  label: string;
  secondary: string | null;
  fields: Record<string, string>;
  contentStatus: ContentApprovalStatus | null;
};

/** Everything the history screen can edit, so the loop edit → history → restore never leaves it. */
export async function listEditableContent(ctx: EventContext): Promise<EditableEntity[]> {
  requireCapability(ctx, 'submission:read_all');
  const db = getDb();

  const [sessions, speakers] = await Promise.all([
    db
      .select({
        id: submission.id,
        ref: submission.ref,
        title: submission.title,
        descriptionMarkdown: submission.descriptionMarkdown,
        level: submission.level,
        status: submission.status,
        contentStatus: submission.contentStatus,
      })
      .from(submission)
      .where(eq(submission.eventId, ctx.eventId))
      .orderBy(asc(submission.ref)),
    db
      .select({
        id: participant.id,
        displayName: participant.displayName,
        jobTitle: participant.jobTitle,
        company: participant.company,
        bioMarkdown: participant.bioMarkdown,
        email: user.email,
      })
      .from(participant)
      .innerJoin(user, eq(user.id, participant.userId))
      .where(eq(participant.eventId, ctx.eventId))
      .orderBy(asc(user.email)),
  ]);

  return [
    ...sessions.map(
      (row): EditableEntity => ({
        kind: 'session',
        id: row.id,
        label: `${formatRef('submission', row.ref)} ${row.title}`,
        secondary: row.status,
        fields: {
          title: row.title,
          descriptionMarkdown: row.descriptionMarkdown ?? '',
          level: row.level ?? '',
        },
        contentStatus: row.contentStatus,
      }),
    ),
    ...speakers.map(
      (row): EditableEntity => ({
        kind: 'participant',
        id: row.id,
        label: row.displayName ?? row.email,
        secondary: row.email,
        fields: {
          displayName: row.displayName ?? '',
          jobTitle: row.jobTitle ?? '',
          company: row.company ?? '',
          bioMarkdown: row.bioMarkdown ?? '',
        },
        contentStatus: null,
      }),
    ),
  ];
}
