import { can } from '@/lib/context';
import { getEvent } from '@/lib/services/events';
import { listSponsors, SPONSOR_KINDS } from '@/lib/services/sponsors';
import { SponsorBoard } from './SponsorBoard';
import { sponsorsContext } from './context';
import { SPONSOR_GROUP_COPY, sponsorLogoUrl, type SponsorGroup } from './types';
import styles from './sponsors.module.css';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Sponsors · Cicero' };

/**
 * `E-7`. Sponsors and exhibitors, read in one query and split here rather than in the client, so
 * the board is handed two ordered lists and does no grouping of its own.
 */
export default async function OrganizerSponsorsPage() {
  const ctx = await sponsorsContext();
  const [rows, event] = await Promise.all([listSponsors(ctx), getEvent(ctx.eventId)]);
  const manages = can(ctx, 'event:manage');

  const groups: SponsorGroup[] = SPONSOR_KINDS.map((kind) => ({
    kind,
    ...SPONSOR_GROUP_COPY[kind],
    rows: rows
      .filter((row) => row.kind === kind)
      .map((row) => ({ ...row, logoUrl: sponsorLogoUrl(row.logoFileId) })),
  }));

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Setup</p>
          <h1 className={styles.title}>Sponsors &amp; exhibitors</h1>
          <p className={styles.subtitle}>Sponsors and exhibitors for this event.</p>
          <p className={styles.subtitle}>
            Drafts stay private. Publish a row to show it on the{' '}
            <a href={`/${event.slug}/sponsors`}>sponsor wall</a>.
          </p>
        </div>
      </div>

      <SponsorBoard groups={groups} canManage={manages} />
    </div>
  );
}
