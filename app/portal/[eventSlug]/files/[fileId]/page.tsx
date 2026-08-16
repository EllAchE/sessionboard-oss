import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Download, FileText } from 'lucide-react';
import { Badge } from '@/components/ui';
import { isAppError } from '@/lib/errors';
import { acceptAttribute, describeAcceptedTypes, formatBytes } from '@/lib/services/file-format';
import { formatDateTime } from '../../../format';
import styles from '../../../portal.module.css';
import { portalSession } from '../../context';
import { myDeliverable } from '../../deliverable';
import { Uploader } from '../../Uploader';
import { CommentThread, type CommentWire } from '../CommentThread';

export const metadata = { title: 'Deliverable · Speaker portal' };

/**
 * `CNT-01`, `CNT-04`, `CNT-05`. One deliverable, its whole version history and the review thread
 * that runs alongside it. Replacing a file from here supersedes rather than overwrites, so the
 * organizer who was midway through reviewing version 2 still has version 2 to open.
 */
export default async function DeliverablePage({
  params,
}: {
  params: Promise<{ eventSlug: string; fileId: string }>;
}) {
  const { eventSlug, fileId } = await params;
  const { event, ctx, me } = await portalSession(eventSlug);

  let deliverable;
  try {
    deliverable = await myDeliverable(ctx, me, fileId);
  } catch (error) {
    if (isAppError(error)) notFound();
    throw error;
  }

  const { current, versions, comments, task } = deliverable;
  const spec = task?.fileRequest ?? null;
  const commentWire: CommentWire[] = comments.map((comment) => ({
    id: comment.id,
    authorName: comment.authorName,
    version: comment.version,
    when: formatDateTime(comment.createdAt, event.timezone),
    bodyHtml: comment.bodyHtml,
  }));

  return (
    <div className={styles.stack}>
      <div className={styles.pageHead}>
        <Link className={styles.backLink} href={`/portal/${eventSlug}/files`}>
          <ChevronLeft size={14} aria-hidden /> All files
        </Link>
        <h1 className={styles.pageTitle}>{current.filename}</h1>
        <p className={styles.pageLead}>
          {task ? task.name : 'Headshot'} · version {current.version} of {versions.length} ·{' '}
          {formatBytes(current.sizeBytes)}
        </p>
      </div>

      <section className={styles.stackTight}>
        <h2 className={styles.sectionTitle}>Upload a replacement</h2>
        <p className={styles.hint}>
          Uploading creates version {current.version + 1}; earlier versions remain available.
        </p>
        <Uploader
          eventSlug={eventSlug}
          intent="replace"
          fileId={current.id}
          accept={spec ? acceptAttribute(spec) : 'image/*'}
          acceptedLabel={spec ? describeAcceptedTypes(spec) : 'JPEG, PNG'}
          maxSizeMb={spec?.maxSizeMb ?? 10}
          buttonLabel="Upload a new version"
        />
      </section>

      <section className={styles.stackTight}>
        <h2 className={styles.sectionTitle}>Version history</h2>
        <ul className={styles.fileList}>
          {[...versions].reverse().map((version) => (
            <li key={version.id} className={styles.fileRow}>
              <FileText size={15} aria-hidden />
              <span className={styles.versionNumber}>v{version.version}</span>
              <span className={styles.fileName}>{version.filename}</span>
              <span className={styles.faint}>
                {version.uploaderName ?? version.uploaderEmail ?? 'Unknown'} ·{' '}
                {formatDateTime(version.createdAt, event.timezone)} ·{' '}
                {formatBytes(version.sizeBytes)}
              </span>
              {version.isCurrent && <Badge tone="success">Current</Badge>}
              <a
                href={`/portal/${eventSlug}/file/${version.id}?download`}
                aria-label={`Download version ${version.version} of ${version.filename}`}
              >
                <Download size={15} />
              </a>
            </li>
          ))}
        </ul>
      </section>

      <CommentThread
        eventSlug={eventSlug}
        fileId={current.id}
        comments={commentWire}
        emptyLabel="No feedback yet."
      />
    </div>
  );
}
