import { isTerminal, listPortalTasks, sortForPortal, summarize } from '@/lib/services/tasks';
import { formatDate } from '../../format';
import styles from '../../portal.module.css';
import { portalSession } from '../context';
import { TaskCard } from './TaskCard';

export const metadata = { title: 'Tasks · Speaker portal' };

/** `S-6`, `S-7`, `S-14`–`S-19`. Outstanding first, overdue at the very top. */
export default async function TasksPage({ params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params;
  const { event, me } = await portalSession(eventSlug);

  const tasks = sortForPortal(await listPortalTasks(event.id, me.id));
  const summary = summarize(tasks);
  const outstanding = tasks.filter((entry) => !isTerminal(entry.status));
  const finished = tasks.filter((entry) => isTerminal(entry.status));

  return (
    <div className={styles.stack}>
      <div className={styles.pageHead}>
        <h1 className={styles.pageTitle}>Tasks</h1>
        <p className={styles.pageLead}>
          {summary.outstanding === 0
            ? 'Nothing outstanding. Anything the organizers add later will appear here.'
            : `${summary.outstanding} outstanding${summary.overdue > 0 ? `, ${summary.overdue} overdue` : ''}${
                summary.nextDueAt ? ` · next deadline ${formatDate(summary.nextDueAt, event.timezone)}` : ''
              }.`}
        </p>
      </div>

      {tasks.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>No tasks yet</div>
          <p>The {event.name} organizers have not asked you for anything yet.</p>
        </div>
      ) : (
        <>
          {outstanding.length > 0 && (
            <section className={styles.stackTight}>
              <h2 className={styles.sectionTitle}>To do</h2>
              {outstanding.map((task) => (
                <TaskCard
                  key={task.assignmentId}
                  task={task}
                  eventSlug={eventSlug}
                  timezone={event.timezone}
                />
              ))}
            </section>
          )}

          {finished.length > 0 && (
            <section className={styles.stackTight}>
              <h2 className={styles.sectionTitle}>Finished</h2>
              {finished.map((task) => (
                <TaskCard
                  key={task.assignmentId}
                  task={task}
                  eventSlug={eventSlug}
                  timezone={event.timezone}
                />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
