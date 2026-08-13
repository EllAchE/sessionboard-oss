import Link from 'next/link';
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, CircleDot } from 'lucide-react';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle } from '@/components/ui';
import {
  getBranding,
  listMySubmissions,
  listPortalPages,
  portalTypes,
  profileGaps,
} from '@/lib/services/portal';
import { isTerminal, listPortalTasks, sortForPortal, summarize } from '@/lib/services/tasks';
import {
  SUBMISSION_STATUS_LABEL,
  formatDate,
  formatTimeRange,
  relativeDue,
  submissionTone,
  taskTone,
} from '../format';
import styles from '../portal.module.css';
import { portalSession, speakerName } from './context';

export const metadata = { title: 'Orator atrium · Cicero' };

/**
 * `S-1`. The screen answers one question before any other: what do I owe, and by when. Everything
 * else on the page is secondary to that list, which is why outstanding work sits above the fold and
 * the branding block does not.
 */
export default async function PortalHomePage({
  params,
}: {
  params: Promise<{ eventSlug: string }>;
}) {
  const { eventSlug } = await params;
  const { event, ctx, me } = await portalSession(eventSlug);

  const [branding, tasks, submissions, pages] = await Promise.all([
    getBranding(event.id),
    listPortalTasks(event.id, me.id),
    listMySubmissions(me.id),
    listPortalPages(event.id),
  ]);

  const summary = summarize(tasks);
  const outstanding = sortForPortal(tasks).filter((entry) => !isTerminal(entry.status));
  const gaps = profileGaps(me);
  const accepted = submissions.filter((entry) => entry.status === 'accepted');
  const pending = submissions.filter((entry) =>
    ['submitted', 'under_review', 'waitlisted'].includes(entry.status),
  );
  const types = portalTypes(eventSlug, submissions, submissions.length);
  const base = `/portal/${eventSlug}`;

  return (
    <div className={styles.stack}>
      <section className={styles.hero}>
        <h1 className={styles.pageTitle}>Salve, {speakerName(me, ctx).split(' ')[0]}</h1>
        {branding.welcomeHtml ? (
          <div
            className={styles.prose}
            /* Organizer-authored, deliberately trusted: `S-7`. */
            dangerouslySetInnerHTML={{ __html: branding.welcomeHtml }}
          />
        ) : (
          <p className={styles.pageLead}>
            This is your private atrium for {event.name} . Settle the duties below at your pace—every
            word and scroll will be waiting when you return.
          </p>
        )}
      </section>

      <section className={styles.statGrid}>
        <Stat
          label="Unsettled duties"
          value={String(summary.outstanding)}
          alert={summary.outstanding > 0}
        />
        <Stat label="Overdue" value={String(summary.overdue)} alert={summary.overdue > 0} />
        <Stat
          label="Next due date"
          value={summary.nextDueAt ? formatDate(summary.nextDueAt, event.timezone) : 'None'}
        />
        <Stat label="Accepted orations" value={String(accepted.length)} />
      </section>

      <section>
        <h2 className={styles.sectionTitle}>
          <CircleDot size={16} aria-hidden /> Duties owed to the Forum
        </h2>
        {outstanding.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyTitle}>Your ledger is clear</div>
            <p>
              No duty remains. If the organizers issue another, it will appear here and a dispatch
              will reach you.
            </p>
          </div>
        ) : (
          <Card padding="none">
            <CardBody>
              {outstanding.slice(0, 6).map((entry) => (
                <div key={entry.assignmentId} className={styles.checkRow}>
                  {entry.overdue ? (
                    <AlertTriangle size={16} aria-hidden />
                  ) : (
                    <CalendarClock size={16} aria-hidden />
                  )}
                  <div className={styles.spacer}>
                    <Link href={`${base}/tasks#${entry.assignmentId}`} className={styles.checkLink}>
                      {entry.name}
                    </Link>
                    <div className={styles.metaLine}>
                      <span>{relativeDue(entry.dueAt)}</span>
                      {entry.dueAt && (
                        <span className={styles.dot}>{formatDate(entry.dueAt, event.timezone)}</span>
                      )}
                      {entry.submissionTitle && (
                        <span className={styles.dot}>{entry.submissionTitle}</span>
                      )}
                      {!entry.required && <span className={styles.dot}>Optional</span>}
                    </div>
                  </div>
                  <Badge tone={taskTone(entry.status, entry.overdue)}>
                    {entry.overdue ? 'Overdue' : relativeDue(entry.dueAt)}
                  </Badge>
                </div>
              ))}
            </CardBody>
            <div className={styles.checkRow}>
              <Link href={`${base}/tasks`}>
                <Button variant="secondary" size="sm" iconRight={<ArrowRight size={14} />}>
                  Open all {summary.total} duties
                </Button>
              </Link>
            </div>
          </Card>
        )}
      </section>

      <div className={styles.grid2}>
        <section>
          <h2 className={styles.sectionTitle}>Your orations</h2>
          <Card>
            <CardBody>
              {submissions.length === 0 ? (
                <p className={styles.muted}>
                  No petition on {event.name} bears your name yet. Once one is filed, its standing
                  appears here.
                </p>
              ) : (
                <div className={styles.stackTight}>
                  {submissions.slice(0, 5).map((entry) => (
                    <div key={entry.id} className={styles.rowBetween}>
                      <div>
                        <Link href={`${base}/submissions/${entry.id}`} className={styles.checkLink}>
                          {entry.title}
                        </Link>
                        <div className={styles.metaLine}>
                          <span>{entry.ref}</span>
                          {entry.formatName && <span className={styles.dot}>{entry.formatName}</span>}
                          {entry.scheduled?.startsAt && (
                            <span className={styles.dot}>
                              {formatTimeRange(
                                entry.scheduled.startsAt,
                                entry.scheduled.endsAt,
                                event.timezone,
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                      <Badge tone={submissionTone(entry.status)}>
                        {SUBMISSION_STATUS_LABEL[entry.status] ?? entry.status}
                      </Badge>
                    </div>
                  ))}
                  {pending.length > 0 && (
                    <p className={styles.faint}>
                      {pending.length} still await the council’s verdict.
                    </p>
                  )}
                </div>
              )}
            </CardBody>
          </Card>
        </section>

        <section>
          <h2 className={styles.sectionTitle}>Your public likeness</h2>
          <Card>
            <CardHeader>
              <CardTitle>
                {gaps.length === 0 ? 'Your likeness is ready for the Forum' : `${gaps.length} inscriptions remain`}
              </CardTitle>
            </CardHeader>
            <CardBody>
              {gaps.length === 0 ? (
                <p className={styles.muted}>
                  Your biography, portrait, and roads elsewhere are what organizers proclaim
                  publicly.
                </p>
              ) : (
                <div className={styles.stackTight}>
                  {gaps.map((gap) => (
                    <div key={gap.key} className={styles.row}>
                      <CheckCircle2 size={15} aria-hidden />
                      <span>{gap.label}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className={styles.taskActions} style={{ marginTop: 'var(--space-4)' }}>
                <Link href={`${base}/profile`}>
                  <Button size="sm" variant={gaps.length > 0 ? 'primary' : 'secondary'}>
                    {gaps.length > 0 ? 'Complete your likeness' : 'Revise your likeness'}
                  </Button>
                </Link>
              </div>
            </CardBody>
          </Card>
        </section>
      </div>

      {pages.length > 0 && (
        <section>
          <h2 className={styles.sectionTitle}>Notices to orators</h2>
          <div className={styles.typeGrid}>
            {pages.map((page) => (
              <Link key={page.id} href={`${base}/pages/${page.slug}`} className={styles.typeCard}>
                <div className={styles.typeLabel}>{page.title}</div>
                <div className={styles.typeDescription}>Written by the {event.name} organizers</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className={styles.sectionTitle}>Every chamber in your atrium</h2>
        <div className={styles.typeGrid}>
          {types.map((type) => (
            <Link key={type.id} href={type.href} className={styles.typeCard}>
              <div className={styles.typeLabel}>
                {type.label}
                {type.count !== null ? ` (${type.count})` : ''}
              </div>
              <div className={styles.typeDescription}>{type.description}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className={styles.stat}>
      <div className={alert ? `${styles.statValue} ${styles.statValueAlert}` : styles.statValue}>
        {value}
      </div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}
