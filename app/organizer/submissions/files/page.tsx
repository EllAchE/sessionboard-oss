import { listEventFileIndex } from '../../../../lib/services/files';
import { getStorageUsage } from '../../../../lib/storage';
import { decideContext } from '../context';
import { fileKind } from './kind';
import { FilesBrowser, type FileRowWire } from './FilesBrowser';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Files · Cicero' };

/**
 * `V-11`. Every file on the event in one table, whatever collected it — a submission answer, a
 * speaker task or a headshot. The organizer asking for "all the decks" wants one archive, not one
 * click per speaker, so selection and the download live together.
 */
export default async function SubmissionFilesPage() {
  const ctx = await decideContext();
  const [files, storage] = await Promise.all([listEventFileIndex(ctx), getStorageUsage()]);

  const rows: FileRowWire[] = files.map((row) => ({
    fileId: row.id,
    filename: row.filename,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
    kind: fileKind(row),
    source: row.source,
    ownerName: row.ownerName,
    ownerEmail: row.ownerEmail,
    taskName: row.taskName,
    taskStatus: row.taskStatus,
    submissionId: row.submissionId,
    submissionRef: row.submissionRef,
    submissionTitle: row.submissionTitle,
    submissionStatus: row.submissionStatus,
    submissionInferred: row.submissionInferred,
    version: row.version,
    versionCount: row.versionCount,
    isCurrent: row.isCurrent,
    commentCount: row.commentCount,
  }));

  return <FilesBrowser rows={rows} storage={storage} />;
}
