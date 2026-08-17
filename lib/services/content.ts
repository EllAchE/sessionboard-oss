import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb, type Database } from '../../db/client';
import {
  contentRevision,
  event,
  file,
  fileRequest,
  participant,
  room,
  scheduledSession,
  sessionFormat,
  sponsor,
  submission,
  task,
  taskAssignment,
  track,
  user,
} from '../../db/schema';
import type { EventContext } from '../context';
import { can, requireCapability } from '../context';
import { appUrl } from '../env';
import { conflict, forbidden, invalid, notFound } from '../errors';
import { formatRef } from '../ids';
import { sendMail } from '../mail';
import { markdownToText, renderMarkdown } from '../markdown';
import { parseSpeakerName } from '../speaker-name';
import type { AgendaTransaction } from './agenda-guard';
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
      skipped.push(`${row.speakerName}: ${row.taskName} is already ${row.state}`);
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

/**
 * `session` is the *submission* — a proposal — and predates the agenda by enough that renaming it
 * would rewrite every stored revision to no reader's benefit. `scheduled_session` is the row on the
 * grid, which is a different thing an organizer edits through a different screen.
 */
export type ContentEntityKind = 'session' | 'participant' | 'scheduled_session' | 'sponsor';

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

/**
 * Deliberately not `ref`, `icsUid`, `icsSequence` or `submissionId`: an organizer never edits any of
 * them, and `ics_sequence` in particular is `comms.ts`'s bookkeeping — putting it in the history
 * would file every calendar resend as a content change.
 */
const SCHEDULED_SESSION_FIELDS: Record<string, string> = {
  title: 'Title',
  descriptionMarkdown: 'Description',
  roomId: 'Room',
  trackId: 'Track',
  formatId: 'Format',
  startsAt: 'Starts',
  endsAt: 'Ends',
  status: 'Status',
  ceuCredits: 'CEU credits',
  clientId: 'Client reference',
};

/**
 * `position` is missing on purpose. It is the drag-order of the sponsor board rather than anything
 * about the sponsor, and one reorder rewrites every row it moved past — tracking it would bury the
 * edits that matter under a wall of "Order: 3 → 4".
 */
const SPONSOR_FIELDS: Record<string, string> = {
  name: 'Name',
  kind: 'Kind',
  status: 'Status',
  tier: 'Tier',
  websiteUrl: 'Website',
  description: 'Description',
  boothLocation: 'Booth',
  logoFileId: 'Logo',
};

const TRACKED_FIELDS: Record<ContentEntityKind, Record<string, string>> = {
  session: SESSION_FIELDS,
  participant: PARTICIPANT_FIELDS,
  scheduled_session: SCHEDULED_SESSION_FIELDS,
  sponsor: SPONSOR_FIELDS,
};

export function trackedFields(kind: ContentEntityKind): Record<string, string> {
  return TRACKED_FIELDS[kind];
}

export type ContentSnapshot = Record<string, unknown>;

/**
 * A snapshot is stored as jsonb and compared against a live row, so anything that survives the
 * round trip as a different type would read as a change on every save. `Date` is the one that
 * bites — `scheduled_session.starts_at` comes back from Postgres as a `Date` and out of jsonb as a
 * string — so it is normalised on the way in and both sides are strings from then on.
 */
function pick(row: Record<string, unknown>, kind: ContentEntityKind): ContentSnapshot {
  const snapshot: ContentSnapshot = {};
  for (const key of Object.keys(trackedFields(kind))) {
    const value = row[key] ?? null;
    snapshot[key] = value instanceof Date ? value.toISOString() : value;
  }
  return snapshot;
}

type EntityState = { snapshot: ContentSnapshot; label: string };

/**
 * Every read and write in this section goes through a handle rather than `getDb()` directly, so an
 * agenda mutation can hand in its own transaction. Without that the snapshot would be written on a
 * second connection and would survive a rollback — a drag the conflict policy refused would leave a
 * revision behind claiming it happened. `reconcileProgram` already takes a `database` the same way.
 */
export type RevisionWriter = Database | AgendaTransaction;

async function readEntity(
  eventId: string,
  kind: ContentEntityKind,
  entityId: string,
  writer: RevisionWriter = getDb(),
): Promise<EntityState> {
  if (kind === 'session') {
    const row = await writer.query.submission.findFirst({
      where: and(eq(submission.id, entityId), eq(submission.eventId, eventId)),
    });
    if (!row) throw notFound('That session');
    return { snapshot: pick(row, kind), label: `${formatRef('submission', row.ref)} ${row.title}` };
  }

  if (kind === 'scheduled_session') {
    const row = await writer.query.scheduledSession.findFirst({
      where: and(eq(scheduledSession.id, entityId), eq(scheduledSession.eventId, eventId)),
    });
    if (!row) throw notFound('That scheduled session');
    return { snapshot: pick(row, kind), label: `${formatRef('session', row.ref)} ${row.title}` };
  }

  if (kind === 'sponsor') {
    const row = await writer.query.sponsor.findFirst({
      where: and(eq(sponsor.id, entityId), eq(sponsor.eventId, eventId)),
    });
    if (!row) throw notFound('That sponsor');
    return { snapshot: pick(row, kind), label: row.name };
  }

  const row = await writer.query.participant.findFirst({
    where: and(eq(participant.id, entityId), eq(participant.eventId, eventId)),
  });
  if (!row) throw notFound('That speaker');
  return { snapshot: pick(row, kind), label: row.displayName ?? 'Speaker profile' };
}

/** Postgres' unique-violation SQLSTATE, which is how a lost numbering race announces itself. */
const UNIQUE_VIOLATION = '23505';

/**
 * Walks `cause`, because drizzle rethrows the driver's error wrapped in a `DrizzleQueryError` that
 * carries the SQL and the params but not the SQLSTATE. Checking only the thrown object read every
 * lost race as an unrelated failure, which turned the retry below into dead code.
 */
function isUniqueViolation(error: unknown): boolean {
  for (let current = error; current && typeof current === 'object'; ) {
    if ((current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
    const next = (current as { cause?: unknown }).cause;
    if (next === current) return false;
    current = next;
  }
  return false;
}

/**
 * Each round of the race is won by someone, so one writer among `k` simultaneous ones can lose at
 * most `k - 1` times. Eight is comfortably past any realistic pile-up on a single session or
 * sponsor, and small enough that a genuine constraint bug surfaces as an error rather than a hang.
 */
const NUMBERING_ATTEMPTS = 8;

/**
 * Claims the next revision number for one entity.
 *
 * The number comes from a subquery *inside* the INSERT rather than a preceding `SELECT max()`, so
 * the read and the write are one statement and no other transaction can commit between them. That
 * is still not enough on its own: under READ COMMITTED two concurrent inserts each see a snapshot
 * without the other's uncommitted row, both compute the same `n + 1`, and Postgres has no gap lock
 * that would make either wait. The unique constraint on
 * `(event_id, entity_kind, entity_id, revision_number)` is what actually settles the race — the
 * loser fails with `23505` and retries, by which point the winner has committed and the subquery
 * returns the number it took. Retrying is also what keeps the sequence *dense*: a lost race that
 * simply gave up would have to leave a hole to make progress.
 */
async function insertNumberedRevision(
  eventId: string,
  kind: ContentEntityKind,
  entityId: string,
  values: { snapshot: ContentSnapshot; summary: string; editorUserId: string; editorName: string },
  writer?: RevisionWriter,
): Promise<number> {
  const nextNumber = sql<number>`(
    select coalesce(max(${contentRevision.revisionNumber}), 0) + 1
    from ${contentRevision}
    where ${contentRevision.eventId} = ${eventId}
      and ${contentRevision.entityKind} = ${kind}::content_revision_kind
      and ${contentRevision.entityId} = ${entityId}
  )`;

  /**
   * Retrying is only ever correct on a connection we own. Inside a caller's transaction a failed
   * statement aborts the whole transaction, so a second attempt would just raise `25P02` — and it
   * is unnecessary there anyway, because `mutateAgendaAtomically` holds a per-event advisory lock
   * that already serialises the writers. The constraint still protects that path; it simply fails
   * the transaction rather than retrying inside it.
   */
  const attempts = writer ? 1 : NUMBERING_ATTEMPTS;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const [row] = await (writer ?? getDb())
        .insert(contentRevision)
        .values({
          eventId,
          entityKind: kind,
          entityId,
          revisionNumber: nextNumber,
          snapshot: values.snapshot,
          summary: values.summary,
          editorUserId: values.editorUserId,
          editorName: values.editorName,
        })
        .returning({ revisionNumber: contentRevision.revisionNumber });
      return row.revisionNumber;
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === attempts) throw error;
    }
  }

  /* Unreachable: the loop either returns or rethrows on its last attempt. */
  throw conflict('That revision could not be numbered. Try again.');
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
  writer?: RevisionWriter,
): Promise<void> {
  const { snapshot } = await readEntity(ctx.eventId, kind, entityId, writer);

  /** A save that changed nothing is not history. Without this every "Save" click grows the list. */
  const [latest] = await (writer ?? getDb())
    .select({ snapshot: contentRevision.snapshot })
    .from(contentRevision)
    .where(
      and(
        eq(contentRevision.eventId, ctx.eventId),
        eq(contentRevision.entityKind, kind),
        eq(contentRevision.entityId, entityId),
      ),
    )
    .orderBy(desc(contentRevision.revisionNumber))
    .limit(1);
  if (latest && diff(kind, latest.snapshot, snapshot).length === 0) return;

  await insertNumberedRevision(
    ctx.eventId,
    kind,
    entityId,
    {
      snapshot,
      summary,
      editorUserId: ctx.actor.impersonatedByUserId ?? ctx.actor.userId,
      editorName: editorLabel(ctx),
    },
    writer,
  );
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
  /** 1-based within the entity, so "revision 4" names the same row for everyone who says it. */
  revisionNumber: number;
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

/** Snapshots hold instants as ISO strings; the columns want `Date`. Anything unparseable is absent. */
function asDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function asOneOf<T extends string>(values: readonly T[], fallback: T) {
  return (value: unknown): T => (values.includes(value as T) ? (value as T) : fallback);
}

/**
 * Restoring a status is restoring a *stored* value, so the fallbacks only ever fire for a snapshot
 * written before the column existed. Each matches its column default.
 */
const asScheduledStatus = asOneOf(['draft', 'published', 'cancelled'] as const, 'draft');
const asSponsorKind = asOneOf(['sponsor', 'exhibitor'] as const, 'sponsor');
const asSponsorStatus = asOneOf(['draft', 'published'] as const, 'draft');

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

/**
 * Resolves a stored uuid to the name a person would recognise. "Room: 6f2a… → 9b1c…" answers none
 * of the question an organizer chasing a mis-moved talk actually has.
 */
type NameResolver = (value: unknown) => string | undefined;

const NO_NAMES: NameResolver = () => undefined;

function present(value: unknown, names: NameResolver): string {
  return names(value) ?? display(value);
}

/**
 * Equality is always decided on the raw stored value and never on the resolved name — two rooms are
 * allowed to share a name, and a rename must not make a real move look like no change at all.
 */
function diff(
  kind: ContentEntityKind,
  before: ContentSnapshot,
  after: ContentSnapshot,
  names: NameResolver = NO_NAMES,
): ContentFieldChange[] {
  const labels = trackedFields(kind);
  return Object.entries(labels)
    .filter(([field]) => display(before[field]) !== display(after[field]))
    .map(([field, label]) => ({
      field,
      label,
      before: present(before[field], names),
      after: present(after[field], names),
    }));
}

/**
 * One lookup covering rooms, tracks and formats. They share a uuid namespace in practice, and the
 * alternative — a per-field map — would make the resolver care which entity kind it was called for.
 */
async function nameResolver(eventId: string): Promise<NameResolver> {
  const db = getDb();
  const [rooms, tracks, formats] = await Promise.all([
    db.select({ id: room.id, name: room.name }).from(room).where(eq(room.eventId, eventId)),
    db.select({ id: track.id, name: track.name }).from(track).where(eq(track.eventId, eventId)),
    db
      .select({ id: sessionFormat.id, name: sessionFormat.name })
      .from(sessionFormat)
      .where(eq(sessionFormat.eventId, eventId)),
  ]);

  const byId = new Map<string, string>();
  for (const row of [...rooms, ...tracks, ...formats]) byId.set(row.id, row.name);
  return (value) => (typeof value === 'string' ? byId.get(value) : undefined);
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

  /** One query for the whole page rather than one per revision, and skipped when nothing needs it. */
  const names = rows.length > 0 ? await nameResolver(eventId) : NO_NAMES;

  const entries: ContentRevisionEntry[] = [];
  for (const [key, group] of byEntity) {
    const [kind, entityId] = key.split(':') as [ContentEntityKind, string];
    /**
     * By number, never by `createdAt`. The loop below reads "what this revision changed" off the
     * *next* entry, so two edits sharing a millisecond used to swap places at random and hand both
     * rows the other's diff. The number is the only total order this list has.
     */
    const ordered = [...group].sort((a, b) => b.revisionNumber - a.revisionNumber);

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
        revisionNumber: row.revisionNumber,
        summary: row.summary,
        editorUserId: row.editorUserId,
        editorName: row.editorName,
        createdAt: row.createdAt,
        snapshot: row.snapshot,
        changed: diff(kind, row.snapshot, after, names),
        isCurrent: index === 0 && diff(kind, row.snapshot, live.snapshot).length === 0,
      });
      after = row.snapshot;
    }
  }

  /**
   * Across entities `createdAt` is the only shared clock, so it still leads here; the number
   * breaks ties within an entity, and the id makes the remaining cross-entity ties stable rather
   * than merely arbitrary.
   */
  return entries.sort(
    (a, b) =>
      b.createdAt.getTime() - a.createdAt.getTime() ||
      b.revisionNumber - a.revisionNumber ||
      a.id.localeCompare(b.id),
  );
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
    /**
     * A cross-entity feed has no single sequence to sort by, so the clock leads and the number
     * decides which of two same-instant revisions of one entity is newer. Both are needed for the
     * `limit` to cut the list at a deterministic place.
     */
    .orderBy(desc(contentRevision.createdAt), desc(contentRevision.revisionNumber))
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
    /** One entity, so the number is a total order and the clock is only ever a display value. */
    .orderBy(desc(contentRevision.revisionNumber));
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
  const restored = pick(row.snapshot, kind);
  // Validate before `recordRevision` snapshots the pre-restore state, so a name that predates the
  // safe-name policy can't leave behind a revision entry claiming a restore happened when it didn't.
  const displayName =
    kind === 'participant' ? parseSpeakerName(asText(restored.displayName)) : null;

  const { label } = await readEntity(ctx.eventId, kind, row.entityId);
  await recordRevision(ctx, kind, row.entityId, `Restored ${label} to revision ${row.revisionNumber}`);

  if (kind === 'scheduled_session') {
    /**
     * A room, track or format can be deleted between the snapshot and the restore, and putting its
     * uuid back would fail the foreign key and take the whole restore with it. Dropping the stale
     * pointer restores everything that still exists instead of refusing to restore anything.
     */
    const names = await nameResolver(ctx.eventId);
    const stillThere = (value: unknown) => (names(value) === undefined ? null : asText(value));

    await db
      .update(scheduledSession)
      .set({
        title: asText(restored.title) ?? 'Untitled',
        descriptionMarkdown: asText(restored.descriptionMarkdown),
        roomId: stillThere(restored.roomId),
        trackId: stillThere(restored.trackId),
        formatId: stillThere(restored.formatId),
        startsAt: asDate(restored.startsAt),
        endsAt: asDate(restored.endsAt),
        status: asScheduledStatus(restored.status),
        ceuCredits: asText(restored.ceuCredits),
        clientId: asText(restored.clientId),
        updatedAt: new Date(),
      })
      .where(
        and(eq(scheduledSession.id, row.entityId), eq(scheduledSession.eventId, ctx.eventId)),
      );
  } else if (kind === 'sponsor') {
    try {
      await db
        .update(sponsor)
        .set({
          name: asText(restored.name) ?? 'Untitled',
          kind: asSponsorKind(restored.kind),
          status: asSponsorStatus(restored.status),
          tier: asText(restored.tier),
          websiteUrl: asText(restored.websiteUrl),
          description: asText(restored.description),
          boothLocation: asText(restored.boothLocation),
          logoFileId: asText(restored.logoFileId),
        })
        .where(and(eq(sponsor.id, row.entityId), eq(sponsor.eventId, ctx.eventId)));
    } catch (error) {
      /** `sponsor_event_kind_name` — another row took the name in the meantime. */
      if (!isUniqueViolation(error)) throw error;
      throw conflict(`Another sponsor is already called ${asText(restored.name) ?? 'that'}`);
    }
  } else if (kind === 'session') {
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
        displayName,
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
  // Validate before `recordRevision` snapshots the pre-edit state, so a rejected name can't leave
  // behind a revision entry claiming an edit happened when the write never ran.
  const displayName = parseSpeakerName(patch.displayName);
  const { label } = await readEntity(ctx.eventId, 'participant', participantId);
  await recordRevision(ctx, 'participant', participantId, `Edited ${label}`);

  await getDb()
    .update(participant)
    .set({
      displayName,
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
  /**
   * Empty for the kinds this screen only *shows*. A scheduled session is edited on the agenda board
   * and a sponsor on the sponsor board, and giving each a second editor here would be two screens
   * writing the same row through different validation. They are listed so their history is
   * selectable and restorable, which is the whole reason to have them on this page.
   */
  fields: Record<string, string>;
  contentStatus: ContentApprovalStatus | null;
};

/**
 * Everything the history screen can select, so the loop edit → history → restore never leaves it.
 */
export async function listEditableContent(ctx: EventContext): Promise<EditableEntity[]> {
  requireCapability(ctx, 'submission:read_all');
  const db = getDb();

  const [scheduled, sponsors] = await Promise.all([
    db
      .select({
        id: scheduledSession.id,
        ref: scheduledSession.ref,
        title: scheduledSession.title,
        status: scheduledSession.status,
      })
      .from(scheduledSession)
      .where(eq(scheduledSession.eventId, ctx.eventId))
      .orderBy(asc(scheduledSession.ref)),
    db
      .select({
        id: sponsor.id,
        name: sponsor.name,
        kind: sponsor.kind,
        status: sponsor.status,
      })
      .from(sponsor)
      .where(eq(sponsor.eventId, ctx.eventId))
      .orderBy(asc(sponsor.position), asc(sponsor.name)),
  ]);

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
    ...scheduled.map(
      (row): EditableEntity => ({
        kind: 'scheduled_session',
        id: row.id,
        label: `${formatRef('session', row.ref)} ${row.title}`,
        secondary: `Agenda · ${row.status}`,
        fields: {},
        contentStatus: null,
      }),
    ),
    ...sponsors.map(
      (row): EditableEntity => ({
        kind: 'sponsor',
        id: row.id,
        label: row.name,
        secondary: `${row.kind} · ${row.status}`,
        fields: {},
        contentStatus: null,
      }),
    ),
  ];
}
