import { and, asc, eq, isNotNull } from 'drizzle-orm';
import { getDb } from '../../db/client';
import {
  event,
  file,
  scheduledSession,
  sessionRecording,
  submission,
} from '../../db/schema';
import { requireCapability, type EventContext } from '../context';
import { invalid, notFound } from '../errors';
import {
  isRecordingCandidate,
  normalizeExternalRecordingUrl,
  recordingPublicationIssue,
} from '../session-recording';
import { getStorage } from '../storage';
import { getFileRecord, type FileRecord } from './files';

export type RecordingRecord = typeof sessionRecording.$inferSelect;

export type RecordingManagerRow = {
  session: Pick<
    typeof scheduledSession.$inferSelect,
    'id' | 'ref' | 'title' | 'startsAt' | 'endsAt' | 'status'
  >;
  recording: RecordingRecord | null;
  file: Pick<FileRecord, 'id' | 'filename' | 'contentType' | 'sizeBytes'> | null;
  publicationIssue: string | null;
};

export type RecordingFileChoice = Pick<
  FileRecord,
  'id' | 'filename' | 'contentType' | 'sizeBytes' | 'createdAt'
>;

function authorize(ctx: EventContext): void {
  requireCapability(ctx, 'agenda:manage');
}

async function ownedSession(ctx: EventContext, sessionId: string) {
  authorize(ctx);
  const row = await getDb().query.scheduledSession.findFirst({
    where: and(eq(scheduledSession.id, sessionId), eq(scheduledSession.eventId, ctx.eventId)),
  });
  if (!row) throw notFound('That session');
  return row;
}

export async function listRecordingManager(
  ctx: EventContext,
  now = new Date(),
): Promise<{ rows: RecordingManagerRow[]; fileChoices: RecordingFileChoice[] }> {
  authorize(ctx);
  const db = getDb();
  const [eventRow, sessions, recordings, files] = await Promise.all([
    db.query.event.findFirst({ where: eq(event.id, ctx.eventId) }),
    db.query.scheduledSession.findMany({
      where: eq(scheduledSession.eventId, ctx.eventId),
      orderBy: [asc(scheduledSession.startsAt), asc(scheduledSession.ref)],
    }),
    db.query.sessionRecording.findMany({ where: eq(sessionRecording.eventId, ctx.eventId) }),
    db.query.file.findMany({ where: eq(file.eventId, ctx.eventId), orderBy: [asc(file.filename)] }),
  ]);
  if (!eventRow) throw notFound('That event');

  const recordingBySession = new Map(recordings.map((row) => [row.sessionId, row]));
  const fileById = new Map(files.map((row) => [row.id, row]));

  return {
    rows: sessions.map((session) => {
      const recording = recordingBySession.get(session.id) ?? null;
      const attached = recording?.fileId ? (fileById.get(recording.fileId) ?? null) : null;
      return {
        session: {
          id: session.id,
          ref: session.ref,
          title: session.title,
          startsAt: session.startsAt,
          endsAt: session.endsAt,
          status: session.status,
        },
        recording,
        file: attached
          ? {
              id: attached.id,
              filename: attached.filename,
              contentType: attached.contentType,
              sizeBytes: attached.sizeBytes,
            }
          : null,
        publicationIssue: recordingPublicationIssue(
          {
            sessionStatus: session.status,
            sessionEndsAt: session.endsAt,
            eventEndsAt: eventRow.endsAt,
          },
          now,
        ),
      };
    }),
    fileChoices: files.filter(isRecordingCandidate).map((row) => ({
      id: row.id,
      filename: row.filename,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      createdAt: row.createdAt,
    })),
  };
}

async function replaceRecording(
  ctx: EventContext,
  sessionId: string,
  source:
    | { kind: 'upload'; fileId: string }
    | { kind: 'external'; externalUrl: string },
): Promise<RecordingRecord> {
  await ownedSession(ctx, sessionId);

  const [row] = await getDb()
    .insert(sessionRecording)
    .values({
      eventId: ctx.eventId,
      sessionId,
      source: source.kind,
      fileId: source.kind === 'upload' ? source.fileId : null,
      externalUrl: source.kind === 'external' ? source.externalUrl : null,
    })
    .onConflictDoUpdate({
      target: sessionRecording.sessionId,
      set: {
        eventId: ctx.eventId,
        source: source.kind,
        fileId: source.kind === 'upload' ? source.fileId : null,
        externalUrl: source.kind === 'external' ? source.externalUrl : null,
        // A changed source must be reviewed and deliberately published again.
        publishedAt: null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function attachStoredRecording(
  ctx: EventContext,
  sessionId: string,
  fileId: string,
): Promise<RecordingRecord> {
  await ownedSession(ctx, sessionId);
  const attached = await getFileRecord(ctx.eventId, fileId);
  if (!isRecordingCandidate(attached)) throw invalid('Choose a video file from this event');
  return replaceRecording(ctx, sessionId, { kind: 'upload', fileId: attached.id });
}

export async function attachExternalRecording(
  ctx: EventContext,
  sessionId: string,
  url: string,
): Promise<RecordingRecord> {
  await ownedSession(ctx, sessionId);
  let externalUrl: string;
  try {
    externalUrl = normalizeExternalRecordingUrl(url);
  } catch (error) {
    throw invalid(error instanceof Error ? error.message : 'Enter a valid recording URL');
  }
  return replaceRecording(ctx, sessionId, { kind: 'external', externalUrl });
}

export async function setRecordingPublished(
  ctx: EventContext,
  recordingId: string,
  published: boolean,
  now = new Date(),
): Promise<RecordingRecord> {
  authorize(ctx);
  const recording = await getDb().query.sessionRecording.findFirst({
    where: and(eq(sessionRecording.id, recordingId), eq(sessionRecording.eventId, ctx.eventId)),
  });
  if (!recording) throw notFound('That recording');

  const session = await ownedSession(ctx, recording.sessionId);
  if (published) {
    const eventRow = await getDb().query.event.findFirst({ where: eq(event.id, ctx.eventId) });
    if (!eventRow) throw notFound('That event');
    const issue = recordingPublicationIssue(
      {
        sessionStatus: session.status,
        sessionEndsAt: session.endsAt,
        eventEndsAt: eventRow.endsAt,
      },
      now,
    );
    if (issue) throw invalid(issue);
  }

  const [updated] = await getDb()
    .update(sessionRecording)
    .set({ publishedAt: published ? now : null, updatedAt: now })
    .where(and(eq(sessionRecording.id, recording.id), eq(sessionRecording.eventId, ctx.eventId)))
    .returning();
  return updated;
}

export async function removeRecording(ctx: EventContext, recordingId: string): Promise<void> {
  authorize(ctx);
  const rows = await getDb()
    .delete(sessionRecording)
    .where(and(eq(sessionRecording.id, recordingId), eq(sessionRecording.eventId, ctx.eventId)))
    .returning({ id: sessionRecording.id });
  if (rows.length === 0) throw notFound('That recording');
}

/**
 * Public reads repeat every publication gate instead of trusting a file id from the URL. A stored
 * recording is reachable only while its own publication timestamp, session publication, content
 * approval, and event ownership all agree.
 */
export async function readPublishedRecording(eventSlug: string, recordingId: string) {
  const db = getDb();
  const eventRow = await db.query.event.findFirst({ where: eq(event.slug, eventSlug) });
  if (!eventRow) throw notFound('That recording');

  const recording = await db.query.sessionRecording.findFirst({
    where: and(
      eq(sessionRecording.id, recordingId),
      eq(sessionRecording.eventId, eventRow.id),
      eq(sessionRecording.source, 'upload'),
      isNotNull(sessionRecording.publishedAt),
    ),
  });
  if (!recording?.fileId) throw notFound('That recording');

  const session = await db.query.scheduledSession.findFirst({
    where: and(
      eq(scheduledSession.id, recording.sessionId),
      eq(scheduledSession.eventId, eventRow.id),
      eq(scheduledSession.status, 'published'),
    ),
  });
  if (!session) throw notFound('That recording');
  const publicationIssue = recordingPublicationIssue({
    sessionStatus: session.status,
    sessionEndsAt: session.endsAt,
    eventEndsAt: eventRow.endsAt,
  });
  if (publicationIssue) throw notFound('That recording');
  if (session.submissionId) {
    const source = await db.query.submission.findFirst({
      where: and(
        eq(submission.id, session.submissionId),
        eq(submission.eventId, eventRow.id),
        eq(submission.contentStatus, 'approved'),
      ),
    });
    if (!source) throw notFound('That recording');
  }

  const record = await getFileRecord(eventRow.id, recording.fileId);
  const stored = await getStorage().get(record.storageKey);
  return { record, body: stored.body, contentType: record.contentType || stored.contentType };
}
