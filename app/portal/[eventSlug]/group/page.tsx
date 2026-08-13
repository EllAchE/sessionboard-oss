import { listGroupMembers, listMySubmissions } from '@/lib/services/portal';
import styles from '../../portal.module.css';
import { portalSession } from '../context';
import { GroupPanel } from './GroupPanel';

export const metadata = { title: 'Delegation · Orator atrium' };

/** `S-12`, `S-13`. The group view of the same identity: everyone you share a session with. */
export default async function GroupPage({ params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params;
  const { me } = await portalSession(eventSlug);

  const submissions = await listMySubmissions(me.id);
  const groups = await Promise.all(
    submissions.map(async (entry) => ({
      submission: entry,
      members: await listGroupMembers(entry.id, me.id),
    })),
  );

  return (
    <div className={styles.stack}>
      <div className={styles.pageHead}>
        <h1 className={styles.pageTitle}>Your delegation</h1>
        <p className={styles.pageLead}>
          Fellow orators, moderators, and panelists on your orations. Summoning someone grants a
          private atrium of their own—their biography and duties, never a copy of yours.
        </p>
      </div>

      {groups.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>No oration to share</div>
          <p>Once an oration bears your name, summon those who will speak beside you here.</p>
        </div>
      ) : (
        groups.map(({ submission, members }) => (
          <GroupPanel
            key={submission.id}
            eventSlug={eventSlug}
            submissionId={submission.id}
            title={`${submission.ref} · ${submission.title}`}
            members={members}
            canManage={submission.isPrimary}
          />
        ))
      )}
    </div>
  );
}
