import { headshotUrl, portalSession } from '../context';
import styles from '../../portal.module.css';
import { HeadshotPanel } from './HeadshotPanel';
import { ProfileForm } from './ProfileForm';

export const metadata = { title: 'Public likeness · Orator atrium' };

/** `S-2`, `S-3`, `S-8`. */
export default async function ProfilePage({
  params,
}: {
  params: Promise<{ eventSlug: string }>;
}) {
  const { eventSlug } = await params;
  const { me } = await portalSession(eventSlug);

  return (
    <div className={styles.stack}>
      <div className={styles.pageHead}>
        <h1 className={styles.pageTitle}>Your public likeness</h1>
        <p className={styles.pageLead}>
          This likeness appears in the programme, throughout Cicero, and beside each oration. The
          heralds proclaim it verbatim, so inscribe it as you wish to be introduced.
        </p>
      </div>

      <HeadshotPanel eventSlug={eventSlug} headshotUrl={headshotUrl(eventSlug, me.headshotFileId)} />
      <ProfileForm eventSlug={eventSlug} me={me} />
    </div>
  );
}
