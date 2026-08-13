import Link from 'next/link';
import { FileText, MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui';
import { countCommentsByLineage, lineageIdOf } from '@/lib/services/files';
import { listPortalTasks, sortForPortal } from '@/lib/services/tasks';
import { headshotUrl, portalSession } from '../context';
import styles from '../../portal.module.css';
import { HeadshotPanel } from '../profile/HeadshotPanel';
import { TaskCard } from '../tasks/TaskCard';

export const metadata = { title: 'Files · Speaker portal' };

/**
 * `S-4`, `S-18`. Every file the event has asked you for, on one screen. The same card the tasks page
 * uses renders here, so a deck uploaded from either place is the same upload against the same
 * request — there is no second copy of a slide deck to go stale.
 */
export default async function FilesPage({ params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params;
  const { event, me } = await portalSession(eventSlug);

  const tasks = sortForPortal(await listPortalTasks(event.id, me.id)).filter(
    (entry) => entry.kind === 'file_upload',
  );
  const uploaded = tasks.reduce((total, entry) => total + entry.files.length, 0);

  const commentCounts = await countCommentsByLineage(event.id);
  const delivered = tasks.flatMap((entry) =>
    entry.files.map((record) => ({
      id: record.id,
      filename: record.filename,
      version: record.version,
      taskName: entry.name,
      comments: commentCounts.get(lineageIdOf(record)) ?? 0,
    })),
  );

  return (
    <div className={styles.stack}>
      <div className={styles.pageHead}>
        <h1 className={styles.pageTitle}>Files</h1>
        <p className={styles.pageLead}>
          Slides, headshots, signed releases — whatever {event.name} has asked you to send.{' '}
          {uploaded > 0
            ? `${uploaded} file${uploaded === 1 ? '' : 's'} received so far.`
            : 'Nothing received yet.'}
        </p>
      </div>

      {delivered.length > 0 && (
        <section className={styles.stackTight}>
          <h2 className={styles.sectionTitle}>What you have sent</h2>
          <p className={styles.hint}>
            Open a file to read the organizers&apos; feedback, reply to it, or upload a new version
            without losing the one on record.
          </p>
          <ul className={styles.fileList}>
            {delivered.map((record) => (
              <li key={record.id} className={styles.fileRow}>
                <FileText size={15} aria-hidden />
                <Link className={styles.fileName} href={`/portal/${eventSlug}/files/${record.id}`}>
                  {record.filename}
                </Link>
                <span className={styles.faint}>{record.taskName}</span>
                {record.version > 1 && <Badge tone="info">Version {record.version}</Badge>}
                {record.comments > 0 && (
                  <span className={styles.faint}>
                    <MessageSquare size={13} aria-hidden /> {record.comments}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <HeadshotPanel eventSlug={eventSlug} headshotUrl={headshotUrl(eventSlug, me.headshotFileId)} />

      {tasks.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>No file requests</div>
          <p>
            The organizers have not asked you for any documents yet. When they do — slides, a signed
            release — the request appears here with what it accepts.
          </p>
        </div>
      ) : (
        <section className={styles.stackTight}>
          <h2 className={styles.sectionTitle}>Requested from you</h2>
          {tasks.map((task) => (
            <TaskCard
              key={task.assignmentId}
              task={task}
              eventSlug={eventSlug}
              timezone={event.timezone}
            />
          ))}
        </section>
      )}
    </div>
  );
}
