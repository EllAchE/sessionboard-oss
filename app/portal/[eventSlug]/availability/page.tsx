import { listMyUnavailability } from '@/lib/services/speaker-availability';
import { formatUnavailabilityWindow } from '../../format';
import styles from '../../portal.module.css';
import { portalSession } from '../context';
import { AvailabilityPanel } from './AvailabilityPanel';

export const metadata = { title: 'Availability · Speaker portal' };

/**
 * `AD-2`. The speaker-authored half of scheduling. It lives in the portal rather than on the
 * organizer's speaker record because the fact is the speaker's: an organizer typing in what they
 * remember a speaker saying on a call is how a stale constraint outlives the conversation that
 * created it.
 */
export default async function AvailabilityPage({
  params,
}: {
  params: Promise<{ eventSlug: string }>;
}) {
  const { eventSlug } = await params;
  const { event, me } = await portalSession(eventSlug);
  const windows = await listMyUnavailability(event.id, me.id);

  /**
   * The zone the speaker authors in. Their profile zone when they have set one, the event's when
   * they have not — and the panel says which of the two it is using, because a speaker who assumes
   * the wrong one enters a window that is silently hours away from what they meant.
   */
  const timezone = me.timezone ?? event.timezone;
  const timezoneSource = me.timezone ? ('profile' as const) : ('event' as const);

  /**
   * Each window is labelled in the zone *it* was authored in, not the zone in use now. A speaker who
   * moves their profile timezone after declaring a window did not change what they meant by it.
   */
  const formatWindow = Object.fromEntries(
    windows.map((window) => [
      window.id,
      formatUnavailabilityWindow(window.startsAt, window.endsAt, window.timezone),
    ]),
  );

  return (
    <div className={styles.stack}>
      <div className={styles.pageHead}>
        <h1 className={styles.pageTitle}>Your availability</h1>
        <p className={styles.pageLead}>
          Tell your organizers when you cannot present. They see it on the agenda as a warning while
          they build the programme.
        </p>
      </div>

      <AvailabilityPanel
        eventSlug={eventSlug}
        windows={windows}
        timezone={timezone}
        timezoneSource={timezoneSource}
        formatWindow={formatWindow}
      />
    </div>
  );
}
