import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../../db/client';
import { file, fileRequest } from '../../db/schema';
import type { EventContext } from '../context';
import { conflict, invalid, notFound } from '../errors';
import { getStorage, storageKey } from '../storage';

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
  createdAt: Date;
};

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

const BYTES_PER_MB = 1024 * 1024;

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

export function acceptAttribute(spec: Pick<FileRequestSpec, 'acceptedTypes'>): string | undefined {
  const types = spec.acceptedTypes.filter((entry) => entry.trim().length > 0);
  if (types.length === 0) return undefined;
  return types.map((entry) => (entry.includes('/') || entry.startsWith('.') ? entry : `.${entry}`)).join(',');
}

export function describeAcceptedTypes(spec: Pick<FileRequestSpec, 'acceptedTypes'>): string {
  const types = spec.acceptedTypes.filter((entry) => entry.trim().length > 0);
  return types.length === 0 ? 'Any file type' : types.join(', ');
}

/**
 * Both limits are enforced here rather than in the route, because the same rules have to hold for a
 * Server Action, the REST surface and an organizer uploading on a speaker's behalf.
 */
export function validateUpload(spec: FileRequestSpec, candidate: UploadCandidate): void {
  if (candidate.sizeBytes <= 0) {
    throw invalid(`${candidate.filename} is empty`);
  }

  const maxBytes = Math.max(1, spec.maxSizeMb) * BYTES_PER_MB;
  if (candidate.sizeBytes > maxBytes) {
    throw invalid(
      `${candidate.filename} is ${(candidate.sizeBytes / BYTES_PER_MB).toFixed(1)} MB. ${spec.label} accepts files up to ${spec.maxSizeMb} MB.`,
    );
  }

  const types = spec.acceptedTypes.filter((entry) => entry.trim().length > 0);
  if (types.length > 0 && !types.some((pattern) => matchesAcceptedType(candidate, pattern))) {
    throw invalid(`${candidate.filename} is not an accepted file type. ${spec.label} accepts ${types.join(', ')}.`);
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
    throw invalid('Choose a file to upload');
  }
  if (!spec.allowMultiple && existingCount + candidates.length > 1) {
    throw conflict(`${spec.label} accepts one file. Remove the current file before uploading another.`);
  }
  for (const candidate of candidates) {
    validateUpload(spec, candidate);
  }
}

export async function getFileRequest(eventId: string, fileRequestId: string): Promise<FileRequestSpec> {
  const row = await getDb().query.fileRequest.findFirst({
    where: and(eq(fileRequest.id, fileRequestId), eq(fileRequest.eventId, eventId)),
  });
  if (!row) throw notFound('That file request');
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
  if (!row) throw notFound('That file');
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
 * Deletes the row and then the object. The other order would leave a `file` row pointing at nothing,
 * which reads as data loss; an orphaned object reads as nothing at all.
 */
export async function deleteFile(ctx: EventContext, fileId: string): Promise<void> {
  const record = await getFileRecord(ctx.eventId, fileId);
  await getDb().delete(file).where(and(eq(file.id, record.id), eq(file.eventId, ctx.eventId)));
  try {
    await getStorage().delete(record.storageKey);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < BYTES_PER_MB) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`;
}
