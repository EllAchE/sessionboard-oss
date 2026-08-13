import Link from 'next/link';
import { Inbox } from 'lucide-react';
import { Badge } from '@/components/ui';
import { requireCurrentActor } from '@/lib/auth';
import { currentEventIdHint } from '@/lib/services/events';
import { activeSmsTransportName } from '@/lib/sms';
import { getSms, listSms, resolveAdminEvent } from '@/lib/services/comms';
import { CommsTabs } from '../comms/CommsTabs';
import { EventPicker } from '../comms/EventPicker';
import { SmsSearch } from './SmsSearch';
import styles from '../comms/comms.module.css';

/**
 * The SMS counterpart to `/admin/mail`: with `SMS_TRANSPORT=log` (the default), this page is the
 * only place a text message exists, so every send — triggered or manual — is fully readable here.
 */
export const dynamic = 'force-dynamic';

const STATUS_TONE = {
  queued: 'neutral',
  sent: 'success',
  failed: 'danger',
} as const;

const STATUS_LABEL = {
  queued: 'awaiting courier',
  sent: 'dispatched',
  failed: 'failed',
} as const;

function when(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default async function SmsMailboxPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; q?: string; id?: string }>;
}) {
  const params = await searchParams;
  const actor = await requireCurrentActor();
  const { event, options } = await resolveAdminEvent({
    eventParam: params.event ?? null,
    cookieEventId: await currentEventIdHint(),
    userId: actor.userId,
  });

  const messages = await listSms({
    eventId: event?.id ?? null,
    search: params.q ?? null,
    limit: 200,
  });

  const selectedId = params.id ?? messages[0]?.id;
  const selected = event && selectedId ? await getSms(event.id, selectedId) : undefined;

  const transport = activeSmsTransportName();
  const query = (id: string) => {
    const next = new URLSearchParams();
    if (event) next.set('event', event.slug);
    if (params.q) next.set('q', params.q);
    next.set('id', id);
    return `/admin/sms?${next.toString()}`;
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Dispatches</p>
          <h1 className={styles.title}>SMS courier archive</h1>
          <p className={styles.lede}>
            Every brief dispatch this assembly has sent or attempted for citizens who chose SMS.
          </p>
        </div>
        <div className={styles.headerActions}>
          {event && <EventPicker current={event.slug} options={options} basePath="/admin/sms" />}
        </div>
      </div>

      <CommsTabs active="sms" eventSlug={event?.slug} />

      <div className={styles.row}>
        <Badge tone={transport === 'log' ? 'info' : 'success'}>courier: {transport}</Badge>
        {transport === 'log' && (
          <span className={styles.subtle}>
            No swift courier leaves the server. Every SMS a citizen would have received rests here.
          </span>
        )}
      </div>

      <div className={styles.mailbox}>
        <div className={styles.mailList}>
          <SmsSearch initial={params.q ?? ''} eventSlug={event?.slug} />
          {messages.length === 0 && (
            <p className={styles.empty}>
              <Inbox size={20} />
              No SMS dispatches yet. Grant an orator SMS summons, or choose that courier route when
              writing a dispatch.
            </p>
          )}
          {messages.map((message) => (
            <Link
              key={message.id}
              href={query(message.id)}
              className={`${styles.mailItem} ${selected?.id === message.id ? styles.mailItemActive : ''}`}
            >
              <span className={styles.mailItemTop}>
                <span className={styles.mailTo}>{message.toPhone}</span>
                <span className={styles.mailWhen}>{when(message.createdAt)}</span>
              </span>
              <span className={styles.mailSubject}>{message.body}</span>
              <span className={styles.mailBadges}>
                <Badge tone={STATUS_TONE[message.status]}>{STATUS_LABEL[message.status]}</Badge>
                {message.templateKey && <Badge>{message.templateKey}</Badge>}
              </span>
            </Link>
          ))}
        </div>

        <div className={styles.mailDetail}>
          {!selected && (
            <p className={styles.empty}>
              <Inbox size={20} />
              Choose a dispatch.
            </p>
          )}

          {selected && (
            <>
              <div>
                <h2 className={styles.previewSubject}>{selected.toPhone}</h2>
                <div className={styles.mailHeaders}>
                  <span className={styles.mailHeaderKey}>To</span>
                  <span className={styles.mailHeaderValue}>{selected.toPhone}</span>
                  <span className={styles.mailHeaderKey}>From</span>
                  <span className={styles.mailHeaderValue}>{selected.fromPhone}</span>
                  <span className={styles.mailHeaderKey}>Dispatched</span>
                  <span className={styles.mailHeaderValue}>
                    {selected.sentAt ? when(selected.sentAt) : 'not dispatched'}
                  </span>
                  <span className={styles.mailHeaderKey}>Dispatch pattern</span>
                  <span className={styles.mailHeaderValue}>{selected.templateKey ?? '—'}</span>
                  <span className={styles.mailHeaderKey}>Standing</span>
                  <span className={styles.mailHeaderValue}>
                    <Badge tone={STATUS_TONE[selected.status]}>
                      {STATUS_LABEL[selected.status]}
                    </Badge>
                  </span>
                </div>
              </div>

              {selected.error && (
                <p className={`${styles.warning} ${styles.danger}`}>{selected.error}</p>
              )}

              <pre className={styles.plainText}>{selected.body}</pre>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
