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
export default async function AdminSponsorsPage() {
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
          <p className={styles.subtitle}>
            The organisations behind this event. Sponsors are recognised in tier order; exhibitors
            have a stand on the floor. Both lists are scoped to this event.
          </p>
          <p className={styles.subtitle}>
            New rows start as drafts. Publish each one when it is ready for the{' '}
            <a href={`/${event.slug}/sponsors`}>sponsor wall</a>, public API, and sponsor embed; return
            it to draft to remove its details and logo from every public surface.
          </p>
        </div>
      </div>

      <SponsorBoard groups={groups} canManage={manages} />
    </div>
  );
}
