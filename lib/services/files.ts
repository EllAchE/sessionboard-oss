import { BYTES_PER_MB } from './file-format';
import { and, asc, desc, eq, inArray, or } from 'drizzle-orm';
import { getDb } from '../../db/client';
import { file, fileComment, fileRequest } from '../../db/schema';
import type { EventContext } from '../context';
import { conflict, invalid, notFound } from '../errors';
import { getStorage, storageKey } from '../storage';
import { isNotNull } from 'drizzle-orm';
import { participant, submission, taskAssignment, user } from '../../db/schema';
import { requireCapability } from '../context';
import { formatRef } from '../ids';
import { renderMarkdown } from '../markdown';

/**
 * `S-3`, `S-4`, `S-18`. Every read and write goes through the app rather than a presigned URL, so a
 * slide deck is only reachable by someone holding a role on its event — see `lib/storage/index.ts`.
 */

export type FileRecord = {
  id: string;
  eventId: string;
  storageKey: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedByUserId: string | null;
  rootFileId: string | null;
  version: number;
  createdAt: Date;
};

export {
  acceptAttribute,
  describeAcceptedTypes,
  formatBytes,
  BYTES_PER_MB,
} from './file-format';

export type FileRequestSpec = {
  id: string;
  label: string;
  helpText: string | null;
  acceptedTypes: string[];
  maxSizeMb: number;
  allowMultiple: boolean;
};

export type UploadCandidate = {
  filename: string;
  contentType: string;
  sizeBytes: number;
};


/** Anything a headshot or a deck could plausibly be, when a request names no types of its own. */
export const DEFAULT_MAX_SIZE_MB = 25;

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot).toLowerCase();
}

/**
 * An accepted type is whatever an organizer typed into the file request: `.pdf`, `application/pdf`,
 * `image/*`, or a bare `pdf`. All four forms are matched rather than rejected, because the failure
 * mode of being strict here is a speaker who cannot upload the file they were asked for.
 */
export function matchesAcceptedType(candidate: UploadCandidate, pattern: string): boolean {
  const rule = pattern.trim().toLowerCase();
  if (!rule || rule === '*' || rule === '*/*') return true;

  const contentType = candidate.contentType.toLowerCase().split(';')[0].trim();
  const extension = extensionOf(candidate.filename);

  if (rule.endsWith('/*')) return contentType.startsWith(rule.slice(0, -1));
  if (rule.includes('/')) return contentType === rule;
  const dotted = rule.startsWith('.') ? rule : `.${rule}`;
  return extension === dotted;
}



/**
 * Both limits are enforced here rather than in the route, because the same rules have to hold for a
 * Server Action, the REST surface and an organizer uploading on a speaker's behalf.
 */
export function validateUpload(spec: FileRequestSpec, candidate: UploadCandidate): void {
  if (candidate.sizeBytes <= 0) {
    throw invalid(`${candidate.filename} is an empty record`);
  }

  const maxBytes = Math.max(1, spec.maxSizeMb) * BYTES_PER_MB;
  if (candidate.sizeBytes > maxBytes) {
    throw invalid(
      `${candidate.filename} is ${(candidate.sizeBytes / BYTES_PER_MB).toFixed(1)} MB. ${spec.label} accepts records up to ${spec.maxSizeMb} MB.`,
    );
  }

  const types = spec.acceptedTypes.filter((entry) => entry.trim().length > 0);
  if (types.length > 0 && !types.some((pattern) => matchesAcceptedType(candidate, pattern))) {
    throw invalid(`${candidate.filename} is not an accepted kind of record. ${spec.label} accepts ${types.join(', ')}.`);
  }
}

/**
 * `allowMultiple` is a property of the request, so the count that matters is what the participant
 * already has against it plus what they are adding now.
 */
export function validateUploadBatch(
  spec: FileRequestSpec,
  candidates: UploadCandidate[],
  existingCount = 0,
): void {
  if (candidates.length === 0) {
    throw invalid('Choose a scroll to lodge');
  }
  if (!spec.allowMultiple && existingCount + candidates.length > 1) {
    throw conflict(`${spec.label} accepts one record. Remove the present record before lodging another.`);
  }
  for (const candidate of candidates) {
    validateUpload(spec, candidate);
  }
}

export async function getFileRequest(eventId: string, fileRequestId: string): Promise<FileRequestSpec> {
  const row = await getDb().query.fileRequest.findFirst({
    where: and(eq(fileRequest.id, fileRequestId), eq(fileRequest.eventId, eventId)),
  });
  if (!row) throw notFound('That request for records');
  return {
    id: row.id,
    label: row.label,
    helpText: row.helpText,
    acceptedTypes: row.acceptedTypes ?? [],
    maxSizeMb: row.maxSizeMb,
    allowMultiple: row.allowMultiple,
  };
}

/** The spec used when a file is collected outside a `file_request` — a headshot, say. */
export function adhocSpec(label: string, overrides: Partial<FileRequestSpec> = {}): FileRequestSpec {
  return {
    id: 'adhoc',
    label,
    helpText: null,
    acceptedTypes: [],
    maxSizeMb: DEFAULT_MAX_SIZE_MB,
    allowMultiple: true,
    ...overrides,
  };
}

export type UploadInput = UploadCandidate & { bytes: ArrayBuffer | Uint8Array };

export async function storeFile(ctx: EventContext, input: UploadInput): Promise<FileRecord> {
  const key = storageKey(ctx.eventId, input.filename);
  await getStorage().put(key, input.bytes, input.contentType || 'application/octet-stream');

  const [row] = await getDb()
    .insert(file)
    .values({
      eventId: ctx.eventId,
      storageKey: key,
      filename: input.filename,
      contentType: input.contentType || 'application/octet-stream',
      sizeBytes: input.sizeBytes,
      uploadedByUserId: ctx.actor.userId,
    })
    .returning();

  return row;
}

/** Validate against the request, then store. One call so no caller can skip the first half. */
export async function uploadForRequest(
  ctx: EventContext,
  spec: FileRequestSpec,
  uploads: UploadInput[],
  existingCount = 0,
): Promise<FileRecord[]> {
  validateUploadBatch(spec, uploads, existingCount);
  const stored: FileRecord[] = [];
  for (const upload of uploads) {
    stored.push(await storeFile(ctx, upload));
  }
  return stored;
}

export async function getFileRecord(eventId: string, fileId: string): Promise<FileRecord> {
  const row = await getDb().query.file.findFirst({
    where: and(eq(file.id, fileId), eq(file.eventId, eventId)),
  });
  if (!row) throw notFound('That record');
  return row;
}

/**
 * The download path. `ctx` can only be built by `requireEventContext`, which already refused anyone
 * without a role on the event, and the event id is re-checked against the row so a file id from one
 * event cannot be read through another event's URL.
 */
export async function readFile(
  ctx: EventContext,
  fileId: string,
): Promise<{ record: FileRecord; body: ReadableStream<Uint8Array>; contentType: string }> {
  const record = await getFileRecord(ctx.eventId, fileId);
  const object = await getStorage().get(record.storageKey);
  return { record, body: object.body, contentType: record.contentType || object.contentType };
}

export async function listFiles(eventId: string, fileIds: string[]): Promise<FileRecord[]> {
  if (fileIds.length === 0) return [];
  return getDb()
    .select()
    .from(file)
    .where(and(eq(file.eventId, eventId), inArray(file.id, fileIds)))
    .orderBy(desc(file.createdAt));
}

/**
 * Deletes the rows and then the objects. The other order would leave a `file` row pointing at
 * nothing, which reads as data loss; an orphaned object reads as nothing at all.
 *
 * Removing a deliverable removes its whole lineage. Keeping superseded versions behind a deleted
 * current one would leave the event holding bytes nobody can reach from any screen.
 */
export async function deleteFile(ctx: EventContext, fileId: string): Promise<void> {
  const record = await getFileRecord(ctx.eventId, fileId);
  const lineage = await lineageRows(ctx.eventId, record);

  await getDb().delete(file).where(
    and(
      eq(file.eventId, ctx.eventId),
      inArray(
        file.id,
        lineage.map((row) => row.id),
      ),
    ),
  );

  for (const row of lineage) {
    try {
      await getStorage().delete(row.storageKey);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
    }
  }
}

// ---------------------------------------------------------------------------
// `CNT-04` deliverable versions
// ---------------------------------------------------------------------------

/** The id every version of a deliverable shares. A first version is the root of its own lineage. */
export function lineageIdOf(record: Pick<FileRecord, 'id' | 'rootFileId'>): string {
  return record.rootFileId ?? record.id;
}

async function lineageRows(eventId: string, record: FileRecord): Promise<FileRecord[]> {
  const root = lineageIdOf(record);
  return getDb()
    .select()
    .from(file)
    .where(and(eq(file.eventId, eventId), or(eq(file.id, root), eq(file.rootFileId, root))))
    .orderBy(asc(file.version), asc(file.createdAt));
}

export type FileVersion = FileRecord & {
  uploaderName: string | null;
  uploaderEmail: string | null;
  isCurrent: boolean;
};

/**
 * Every version of one deliverable, oldest first. Any id in the lineage resolves the same list, so a
 * stale link to version 1 still opens the history rather than a dead end.
 */
export async function listFileVersions(eventId: string, fileId: string): Promise<FileVersion[]> {
  const record = await getFileRecord(eventId, fileId);
  const rows = await lineageRows(eventId, record);

  const uploaderIds = [
    ...new Set(rows.map((row) => row.uploadedByUserId).filter((id): id is string => Boolean(id))),
  ];
  const uploaders = uploaderIds.length
    ? await getDb()
        .select({ id: user.id, name: user.name, email: user.email })
        .from(user)
        .where(inArray(user.id, uploaderIds))
    : [];
  const uploaderById = new Map(uploaders.map((row) => [row.id, row]));

  const top = rows.reduce((highest, row) => Math.max(highest, row.version), 0);
  return rows.map((row) => {
    const uploader = row.uploadedByUserId ? uploaderById.get(row.uploadedByUserId) : undefined;
    return {
      ...row,
      uploaderName: uploader?.name ?? null,
      uploaderEmail: uploader?.email ?? null,
      isCurrent: row.version === top,
    };
  });
}

/** The version anything pointing at this lineage should be reading right now. */
export async function currentVersionOf(eventId: string, fileId: string): Promise<FileRecord> {
  const record = await getFileRecord(eventId, fileId);
  const rows = await lineageRows(eventId, record);
  return rows[rows.length - 1] ?? record;
}

/**
 * Stores a replacement as the next version of an existing deliverable. The prior row is untouched,
 * which is the whole point: the organizer who already reviewed version 2 can still open version 2.
 */
export async function supersedeFile(
  ctx: EventContext,
  previousFileId: string,
  input: UploadInput,
): Promise<FileRecord> {
  const previous = await getFileRecord(ctx.eventId, previousFileId);
  const rows = await lineageRows(ctx.eventId, previous);
  const root = lineageIdOf(previous);
  const nextVersion = rows.reduce((highest, row) => Math.max(highest, row.version), 0) + 1;

  const key = storageKey(ctx.eventId, input.filename);
  await getStorage().put(key, input.bytes, input.contentType || 'application/octet-stream');

  const [row] = await getDb()
    .insert(file)
    .values({
      eventId: ctx.eventId,
      storageKey: key,
      filename: input.filename,
      contentType: input.contentType || 'application/octet-stream',
      sizeBytes: input.sizeBytes,
      uploadedByUserId: ctx.actor.userId,
      rootFileId: root,
      version: nextVersion,
    })
    .returning();

  return row;
}

// ---------------------------------------------------------------------------
// `CNT-05` review conversation on a deliverable
// ---------------------------------------------------------------------------

export type DeliverableComment = {
  id: string;
  fileId: string;
  version: number;
  authorUserId: string | null;
  authorName: string;
  bodyMarkdown: string;
  bodyHtml: string;
  createdAt: Date;
};

/**
 * The thread is keyed to the lineage, not to one upload. Feedback written against version 1 is the
 * reason version 2 exists, so it has to still be on screen when version 2 arrives.
 */
export async function listFileComments(eventId: string, fileId: string): Promise<DeliverableComment[]> {
  const record = await getFileRecord(eventId, fileId);
  const rows = await lineageRows(eventId, record);
  const versionById = new Map(rows.map((row) => [row.id, row.version]));

  const comments = await getDb()
    .select()
    .from(fileComment)
    .where(
      inArray(
        fileComment.fileId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(asc(fileComment.createdAt));

  return comments.map((row) => ({
    id: row.id,
    fileId: row.fileId,
    version: versionById.get(row.fileId) ?? 1,
    authorUserId: row.authorUserId,
    authorName: row.authorName,
    bodyMarkdown: row.bodyMarkdown,
    bodyHtml: renderMarkdown(row.bodyMarkdown),
    createdAt: row.createdAt,
  }));
}

export async function addFileComment(
  ctx: EventContext,
  fileId: string,
  bodyMarkdown: string,
): Promise<DeliverableComment> {
  const body = bodyMarkdown.trim();
  if (body.length === 0) throw invalid('Write something before posting it');
  if (body.length > 4000) throw invalid('Keep a comment under 4000 characters');

  const record = await getFileRecord(ctx.eventId, fileId);
  const [row] = await getDb()
    .insert(fileComment)
    .values({
      fileId: record.id,
      authorUserId: ctx.actor.userId,
      authorName: ctx.actor.name ?? ctx.actor.email,
      bodyMarkdown: body,
    })
    .returning();

  return {
    id: row.id,
    fileId: row.fileId,
    version: record.version,
    authorUserId: row.authorUserId,
    authorName: row.authorName,
    bodyMarkdown: row.bodyMarkdown,
    bodyHtml: renderMarkdown(row.bodyMarkdown),
    createdAt: row.createdAt,
  };
}

/** How many comments each lineage carries, for a table that has to show it a hundred rows at a time. */
export async function countCommentsByLineage(eventId: string): Promise<Map<string, number>> {
  const rows = await getDb()
    .select({ fileId: fileComment.fileId, rootFileId: file.rootFileId, id: file.id })
    .from(fileComment)
    .innerJoin(file, eq(file.id, fileComment.fileId))
    .where(eq(file.eventId, eventId));

  const counts = new Map<string, number>();
  for (const row of rows) {
    const root = row.rootFileId ?? row.id;
    counts.set(root, (counts.get(root) ?? 0) + 1);
  }
  return counts;
}

// ---------------------------------------------------------------------------
// `V-11` event-wide file index
// ---------------------------------------------------------------------------

/** Every file on the event, newest first. `listFiles` needs the ids up front; this one finds them. */
export async function listEventFiles(eventId: string): Promise<FileRecord[]> {
  return getDb()
    .select()
    .from(file)
    .where(eq(file.eventId, eventId))
    .orderBy(desc(file.createdAt));
}

/**
 * Where a file came from. `unattached` is not an error state: an event logo and a file whose
 * submission answer was later cleared both land there, and both still have to be downloadable.
 */
export type EventFileSource = 'submission' | 'task' | 'headshot' | 'unattached';

export type EventFileRow = FileRecord & {
  source: EventFileSource;
  ownerName: string | null;
  ownerEmail: string | null;
  submissionId: string | null;
  submissionRef: string | null;
  submissionTitle: string | null;
  submissionStatus: string | null;
  lineageId: string;
  versionCount: number;
  isCurrent: boolean;
  commentCount: number;
};

const FILE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidsIn(answers: Record<string, unknown>): string[] {
  const found: string[] = [];
  for (const value of Object.values(answers)) {
    if (typeof value === 'string' && FILE_UUID.test(value)) found.push(value);
    else if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === 'string' && FILE_UUID.test(entry)) found.push(entry);
      }
    }
  }
  return found;
}

/**
 * The bulk-download screen's backing query. Which answer holds a file id is a property of the form
 * rather than of the submission, so submission attribution collects anything uuid-shaped out of
 * `answers` and lets the join against `file` decide what was really a file — the same trick
 * `listSubmissionFiles` uses, widened from a set of submissions to the whole event.
 */
export async function listEventFileIndex(ctx: EventContext): Promise<EventFileRow[]> {
  requireCapability(ctx, 'submission:read_all');
  const db = getDb();

  const [files, submissions, taskUploads, headshots] = await Promise.all([
    listEventFiles(ctx.eventId),
    db
      .select({
        id: submission.id,
        ref: submission.ref,
        title: submission.title,
        status: submission.status,
        answers: submission.answers,
        ownerName: user.name,
        ownerEmail: user.email,
      })
      .from(submission)
      .innerJoin(user, eq(user.id, submission.submitterUserId))
      .where(eq(submission.eventId, ctx.eventId)),
    db
      .select({
        fileId: taskAssignment.fileId,
        answers: taskAssignment.answers,
        submissionId: taskAssignment.submissionId,
        ownerName: user.name,
        ownerEmail: user.email,
      })
      .from(taskAssignment)
      .innerJoin(participant, eq(participant.id, taskAssignment.participantId))
      .innerJoin(user, eq(user.id, participant.userId))
      .where(eq(participant.eventId, ctx.eventId)),
    db
      .select({
        fileId: participant.headshotFileId,
        ownerName: user.name,
        ownerEmail: user.email,
      })
      .from(participant)
      .innerJoin(user, eq(user.id, participant.userId))
      .where(and(eq(participant.eventId, ctx.eventId), isNotNull(participant.headshotFileId))),
  ]);

  if (files.length === 0) return [];

  type Attribution = {
    source: EventFileSource;
    ownerName: string | null;
    ownerEmail: string | null;
    submissionId: string | null;
    submissionRef: string | null;
    submissionTitle: string | null;
    submissionStatus: string | null;
  };
  const submissionById = new Map(submissions.map((row) => [row.id, row]));
  const attribution = new Map<string, Attribution>();

  const describe = (
    source: EventFileSource,
    owner: { ownerName: string | null; ownerEmail: string | null },
    submissionId: string | null,
  ): Attribution => {
    const parent = submissionId ? submissionById.get(submissionId) : undefined;
    return {
      source,
      ownerName: owner.ownerName,
      ownerEmail: owner.ownerEmail,
      submissionId: parent?.id ?? null,
      submissionRef: parent ? formatRef('submission', parent.ref) : null,
      submissionTitle: parent?.title ?? null,
      submissionStatus: parent?.status ?? null,
    };
  };

  for (const row of headshots) {
    if (row.fileId) attribution.set(row.fileId, describe('headshot', row, null));
  }
  for (const row of taskUploads) {
    const attributed = describe('task', row, row.submissionId);
    if (row.fileId) attribution.set(row.fileId, attributed);
    for (const candidate of uuidsIn(row.answers ?? {})) {
      attribution.set(candidate, attributed);
    }
  }
  // Last, because a file reachable from a submission answer is best described by that submission.
  for (const row of submissions) {
    for (const candidate of uuidsIn(row.answers)) {
      attribution.set(candidate, describe('submission', row, row.id));
    }
  }

  const unattached: Attribution = {
    source: 'unattached',
    ownerName: null,
    ownerEmail: null,
    submissionId: null,
    submissionRef: null,
    submissionTitle: null,
    submissionStatus: null,
  };

  /**
   * A replacement upload is attached to nothing — the submission answer or task assignment still
   * names an earlier version. Attribution is therefore resolved per lineage, or every re-upload
   * would drop out of the organizer's table as an orphan the moment it was made.
   */
  const byLineage = new Map<string, Attribution>();
  for (const record of files) {
    const direct = attribution.get(record.id);
    if (direct) byLineage.set(lineageIdOf(record), direct);
  }

  const versionCounts = new Map<string, number>();
  const topVersions = new Map<string, number>();
  for (const record of files) {
    const root = lineageIdOf(record);
    versionCounts.set(root, (versionCounts.get(root) ?? 0) + 1);
    topVersions.set(root, Math.max(topVersions.get(root) ?? 0, record.version));
  }

  const commentCounts = await countCommentsByLineage(ctx.eventId);

  return files.map((record) => {
    const root = lineageIdOf(record);
    return {
      ...record,
      ...(attribution.get(record.id) ?? byLineage.get(root) ?? unattached),
      lineageId: root,
      versionCount: versionCounts.get(root) ?? 1,
      isCurrent: record.version === (topVersions.get(root) ?? record.version),
      commentCount: commentCounts.get(root) ?? 0,
    };
  });
}
