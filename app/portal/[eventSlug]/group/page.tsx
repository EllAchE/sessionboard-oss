import { listGroupMembers, listMySubmissions } from '@/lib/services/portal';
import styles from '../../portal.module.css';
import { portalSession } from '../context';
import { GroupPanel } from './GroupPanel';

export const metadata = { title: 'Group · Speaker portal' };

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
        <h1 className={styles.pageTitle}>Group access</h1>
        <p className={styles.pageLead}>
          Co-speakers, moderators and panelists on your sessions. Adding someone gives them their own
          portal for the session — their own bio, their own tasks — rather than a copy of yours.
        </p>
      </div>

      {groups.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>No sessions to share</div>
          <p>Once you have a session, you can add the people speaking on it with you here.</p>
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
