import { notFound } from 'next/navigation';
import { isAppError } from '../../../../../../lib/errors';
import {
  lineageIdOf,
  listEventFileIndex,
  listFileComments,
  listFileVersions,
} from '../../../../../../lib/services/files';
import { decideContext } from '../../../context';
import { DeliverableDetail, type CommentWire, type VersionWire } from './DeliverableDetail';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Deliverable · Cicero' };

function when(value: Date): string {
  return value.toISOString().slice(0, 16).replace('T', ' ');
}

/**
 * `CNT-04`, `CNT-05` on the organizer's side. Any id in a lineage lands here, so a link an organizer
 * saved before the speaker re-uploaded still opens the deliverable rather than a dead version.
 */
export default async function DeliverableDetailPage({
  params,
}: {
  params: Promise<{ fileId: string }>;
}) {
  const [ctx, { fileId }] = await Promise.all([decideContext(), params]);

  try {
    const [versions, comments, index] = await Promise.all([
      listFileVersions(ctx.eventId, fileId),
      listFileComments(ctx.eventId, fileId),
      listEventFileIndex(ctx),
    ]);

    const current = versions.find((version) => version.isCurrent) ?? versions[versions.length - 1];
    if (!current) notFound();

    const lineageId = lineageIdOf(current);
    const owner = index.find((row) => row.lineageId === lineageId) ?? null;

    const versionWire: VersionWire[] = versions.map((version) => ({
      id: version.id,
      filename: version.filename,
      version: version.version,
      sizeBytes: version.sizeBytes,
      uploader: version.uploaderName ?? version.uploaderEmail ?? 'Unknown',
      uploadedAt: when(version.createdAt),
      isCurrent: version.isCurrent,
    }));

    const commentWire: CommentWire[] = comments.map((comment) => ({
      id: comment.id,
      authorName: comment.authorName,
      version: comment.version,
      when: when(comment.createdAt),
      bodyHtml: comment.bodyHtml,
    }));

    return (
      <DeliverableDetail
        currentId={current.id}
        filename={current.filename}
        versions={versionWire}
        comments={commentWire}
        ownerName={owner?.ownerName ?? owner?.ownerEmail ?? null}
        submissionId={owner?.submissionId ?? null}
        submissionRef={owner?.submissionRef ?? null}
        submissionTitle={owner?.submissionTitle ?? null}
      />
    );
  } catch (error) {
    if (isAppError(error)) notFound();
    throw error;
  }
}
