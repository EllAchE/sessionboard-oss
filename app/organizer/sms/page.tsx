import Link from 'next/link';
import { Inbox, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui';
import { magicLinkMayBeShown, requireCurrentActor } from '@/lib/auth';
import { currentEventIdHint } from '@/lib/services/events';
import { activeSmsTransportName } from '@/lib/sms';
import {
  emailForSmsRecipient,
  getSms,
  listSms,
  resolveOrganizerEvent,
  type SmsMailboxEntry,
} from '@/lib/services/comms';
import { CommsTabs } from '../comms/CommsTabs';
import { EventPicker } from '../comms/EventPicker';
import { carriesMagicLink, smsMailboxBody, type SmsMailboxBody } from './magic-links';
import { SmsSearch } from './SmsSearch';
import styles from '../comms/comms.module.css';

/**
 * The SMS counterpart to `/organizer/mail`: with `SMS_TRANSPORT=log` (the default), this page is the
 * only place a text message exists, so every send — triggered or manual — is fully readable here.
 */
export const dynamic = 'force-dynamic';

const STATUS_TONE = {
  queued: 'neutral',
  sent: 'success',
  delivered: 'success',
  undelivered: 'danger',
  failed: 'danger',
} as const;

function when(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

/**
 * A token in an SMS is a session as the phone's owner. Resolve exactly one owner, then ask the same
 * demo-access policy as the mail archive using the channel that actually carried this message.
 * Missing and duplicate phone matches both fail closed inside `emailForSmsRecipient`.
 */
async function renderableBody(
  entry: SmsMailboxEntry,
  transport: ReturnType<typeof activeSmsTransportName>,
): Promise<SmsMailboxBody> {
  if (!carriesMagicLink(entry)) return smsMailboxBody(entry, null);
  const recipientEmail = await emailForSmsRecipient(entry.toPhone);
  const visibility = recipientEmail
    ? await magicLinkMayBeShown(recipientEmail, transport)
    : null;
  return smsMailboxBody(entry, visibility);
}

export default async function SmsMailboxPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; q?: string; id?: string }>;
}) {
  const params = await searchParams;
  const actor = await requireCurrentActor();
  const { event, options } = await resolveOrganizerEvent({
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
  const body = selected ? await renderableBody(selected, transport) : undefined;
  const query = (id: string) => {
    const next = new URLSearchParams();
    if (event) next.set('event', event.slug);
    if (params.q) next.set('q', params.q);
    next.set('id', id);
    return `/organizer/sms?${next.toString()}`;
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Communications</p>
          <h1 className={styles.title}>SMS</h1>
          <p className={styles.lede}>
            Every text this event has sent or tried to send, to anyone who chose SMS over email.
          </p>
        </div>
        <div className={styles.headerActions}>
          {event && <EventPicker current={event.slug} options={options} basePath="/organizer/sms" />}
        </div>
      </div>

      <CommsTabs active="sms" eventSlug={event?.slug} />

      <div className={styles.row}>
        <Badge tone={transport === 'log' ? 'info' : 'success'}>transport: {transport}</Badge>
        {transport === 'log' && (
          <span className={styles.subtle}>
            Nothing leaves the server. Everything a recipient would have received as a text is
            readable here.
          </span>
        )}
      </div>

      <div className={styles.mailbox}>
        <div className={styles.mailList}>
          <SmsSearch initial={params.q ?? ''} eventSlug={event?.slug} />
          {messages.length === 0 && (
            <p className={styles.empty}>
              <Inbox size={20} />
              No texts yet. Turn on SMS alerts for a speaker, or force the channel from Compose.
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
              {/* The list has no per-recipient visibility check; never put a credential in it. */}
              <span className={styles.mailSubject}>{smsMailboxBody(message, null).body}</span>
              <span className={styles.mailBadges}>
                <Badge tone={STATUS_TONE[message.status]}>{message.status}</Badge>
                {message.templateKey && <Badge>{message.templateKey}</Badge>}
              </span>
            </Link>
          ))}
        </div>

        <div className={styles.mailDetail}>
          {!selected && (
            <p className={styles.empty}>
              <Inbox size={20} />
              Choose a message.
            </p>
          )}

          {selected && body && (
            <>
              <div>
                <h2 className={styles.previewSubject}>{selected.toPhone}</h2>
                <div className={styles.mailHeaders}>
                  <span className={styles.mailHeaderKey}>To</span>
                  <span className={styles.mailHeaderValue}>{selected.toPhone}</span>
                  <span className={styles.mailHeaderKey}>From</span>
                  <span className={styles.mailHeaderValue}>{selected.fromPhone}</span>
                  <span className={styles.mailHeaderKey}>Sent</span>
                  <span className={styles.mailHeaderValue}>
                    {selected.sentAt ? when(selected.sentAt) : 'not dispatched'}
                  </span>
                  <span className={styles.mailHeaderKey}>Template</span>
                  <span className={styles.mailHeaderValue}>{selected.templateKey ?? '—'}</span>
                  <span className={styles.mailHeaderKey}>Status</span>
                  <span className={styles.mailHeaderValue}>
                    <Badge tone={STATUS_TONE[selected.status]}>{selected.status}</Badge>
                  </span>
                </div>
              </div>

              {selected.error && (
                <p className={`${styles.warning} ${styles.danger}`}>{selected.error}</p>
              )}

              {body.redacted && (
                <p className={styles.notice}>
                  <ShieldCheck size={16} />
                  <span>
                    This text carried a sign-in link for {selected.toPhone}, and it has been
                    withheld. That link is a session as that person, so this archive shows it only
                    when Cicero can identify the recipient and the configured delivery policy
                    permits it.
                  </span>
                </p>
              )}

              <pre className={styles.plainText}>{body.body}</pre>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
