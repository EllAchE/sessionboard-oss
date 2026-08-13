import Link from 'next/link';
import { CalendarClock, MapPin } from 'lucide-react';
import { Badge, Card, CardBody } from '@/components/ui';
import { listMySubmissions } from '@/lib/services/portal';
import {
  ROLE_LABEL,
  SUBMISSION_STATUS_LABEL,
  formatTimeRange,
  submissionTone,
} from '../../format';
import styles from '../../portal.module.css';
import { portalSession } from '../context';

export const metadata = { title: 'My orations · Orator atrium' };

/** `S-5`. Ref, title, format and status — the four things a speaker looks for. */
export default async function SubmissionsPage({
  params,
}: {
  params: Promise<{ eventSlug: string }>;
}) {
  const { eventSlug } = await params;
  const { event, me } = await portalSession(eventSlug);
  const submissions = await listMySubmissions(me.id);

  return (
    <div className={styles.stack}>
      <div className={styles.pageHead}>
        <h1 className={styles.pageTitle}>My orations</h1>
        <p className={styles.pageLead}>
          Every petition bearing your name at {event.name}, and its present standing before the
          council.
        </p>
      </div>

      {submissions.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>No orations yet</div>
          <p>
            When a petition bearing your name is filed, its reference and standing appear here. Once
            the fasti are proclaimed, its hour and chamber join them.
          </p>
        </div>
      ) : (
        <div className={styles.stackTight}>
          {submissions.map((entry) => (
            <Card key={entry.id}>
              <CardBody>
                <div className={styles.rowBetween}>
                  <div className={styles.spacer}>
                    <Link
                      href={`/portal/${eventSlug}/submissions/${entry.id}`}
                      className={styles.checkLink}
                    >
                      {entry.title}
                    </Link>
                    <div className={styles.metaLine}>
                      <span>{entry.ref}</span>
                      {entry.formatName && <span className={styles.dot}>{entry.formatName}</span>}
                      {entry.trackName && <span className={styles.dot}>{entry.trackName}</span>}
                      {entry.level && <span className={styles.dot}>{entry.level}</span>}
                      <span className={styles.dot}>
                        {ROLE_LABEL[entry.myRole] ?? entry.myRole}
                        {entry.isPrimary ? ' · primary' : ''}
                      </span>
                    </div>
                    {entry.scheduled && (
                      <div className={styles.metaLine}>
                        <CalendarClock size={14} aria-hidden />
                        <span>
                          {formatTimeRange(
                            entry.scheduled.startsAt,
                            entry.scheduled.endsAt,
                            event.timezone,
                          )}
                        </span>
                        {entry.scheduled.roomName && (
                          <>
                            <MapPin size={14} aria-hidden />
                            <span>{entry.scheduled.roomName}</span>
                          </>
                        )}
                        {!entry.scheduled.published && (
                          <Badge tone="warning">Not yet proclaimed</Badge>
                        )}
                      </div>
                    )}
                  </div>
                  <div className={styles.stackTight}>
                    <Badge tone={submissionTone(entry.status)}>
                      {SUBMISSION_STATUS_LABEL[entry.status] ?? entry.status}
                    </Badge>
                    {entry.editable && <Badge tone="neutral">Editable</Badge>}
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
