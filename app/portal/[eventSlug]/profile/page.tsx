import { getProfileName } from '@/lib/services/portal';
import { getNotificationPrefs } from '@/lib/services/settings';
import { headshotUrl, portalSession } from '../context';
import styles from '../../portal.module.css';
import { HeadshotPanel } from './HeadshotPanel';
import { ProfileForm } from './ProfileForm';

export const metadata = { title: 'Profile · Speaker portal' };

/** `S-2`, `S-3`, `S-8`. */
export default async function ProfilePage({
  params,
}: {
  params: Promise<{ eventSlug: string }>;
}) {
  const { eventSlug } = await params;
  const { me, ctx } = await portalSession(eventSlug);
  const [notifications, name] = await Promise.all([
    getNotificationPrefs(ctx.actor.userId),
    getProfileName(ctx.actor.userId),
  ]);

  return (
    <div className={styles.stack}>
      <div className={styles.pageHead}>
        <h1 className={styles.pageTitle}>Your profile</h1>
        <p className={styles.pageLead}>
          This is what appears on the programme, in the app and on the session page. Organizers copy
          it verbatim, so write it the way you want to be introduced.
        </p>
      </div>

      <HeadshotPanel eventSlug={eventSlug} headshotUrl={headshotUrl(eventSlug, me.headshotFileId)} />
      <ProfileForm eventSlug={eventSlug} me={me} name={name} notifications={notifications} />
    </div>
  );
}
