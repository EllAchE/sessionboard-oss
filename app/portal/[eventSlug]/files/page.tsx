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
