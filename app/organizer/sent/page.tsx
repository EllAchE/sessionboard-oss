import Link from 'next/link';
import { CalendarDays, Download, Inbox, Link2, Mail, MessageSquare, ShieldCheck } from 'lucide-react';
import { Badge, Card, CardBody } from '@/components/ui';
import { magicLinkMayBeShown, requireCurrentActor } from '@/lib/auth';
import { currentEventIdHint } from '@/lib/services/events';
import { activeTransportName } from '@/lib/mail';
import { activeSmsTransportName } from '@/lib/sms';
import {
  emailForSmsRecipient,
  getMail,
  getSms,
  listMail,
  listSms,
  resolveOrganizerEvent,
  type MailboxEntry,
  type SmsMailboxEntry,
} from '@/lib/services/comms';
import { CommsTabs } from '../comms/CommsTabs';
import { EventPicker } from '../comms/EventPicker';
import { RunRemindersButton } from '../mail/RunRemindersButton';
import {
  carriesMagicLink as mailCarriesMagicLink,
  mailboxBody,
  type MailboxBody,
} from '../mail/magic-links';
import {
  carriesMagicLink as smsCarriesMagicLink,
  smsMailboxBody,
  type SmsMailboxBody,
} from '../sms/magic-links';
import { SentSearch } from './SentSearch';
import {
  isSentFilter,
  mailToSent,
  mergeSent,
  parseSentKey,
  smsToSent,
  statusTone,
  type SentFilter,
} from './messages';
import styles from '../comms/comms.module.css';

/**
 * `T-7a` and `C-5`. One log for both channels, replacing the separate `/organizer/mail` and
 * `/organizer/sms` screens — which were the same master/detail view over two tables, and forced an
 * organizer to know which channel a message went out on before they could go looking for it. The
 * question is almost always "did Ada get her acceptance", not "did Ada get an email"; the answer
 * now sits in one time-ordered list with the channel as a filter over it rather than a fork above
 * it. Both old paths redirect here.
 *
 * `MAIL_TRANSPORT=log` and `SMS_TRANSPORT=log` are the defaults, so on the demo deployment this
 * page is the *only* place either kind of message exists — a judge who never checks an inbox opens
 * the acceptance email here, clicks the magic link inside it, and downloads the calendar invite.
 * It is therefore a product surface, not a debug tool.
 *
 * The redaction rules are per-channel and stay that way. A body can carry a live sign-in token,
 * both `sendMail` and `sendSms` write that body to their log before dispatch under *every*
 * transport, and the reader of this page is not always the person the token belongs to. Email asks
 * `../mail/magic-links`; SMS asks `../sms/magic-links`, which has the harder job of identifying a
 * recipient from a phone number first and fails closed when it cannot. Neither policy is relaxed by
 * being displayed next to the other — see those files, and `lib/demo-access.ts`, which owns the rule.
 */
export const dynamic = 'force-dynamic';

const LIMIT = 200;

function when(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

/**
 * The email body as this reader is allowed to see it. `magicLinkMayBeShown` is only asked when the
 * body actually carries a sign-in token, so an ordinary acceptance email costs no extra queries —
 * and a body with no credential in it is never gated on anything.
 */
async function renderableMailBody(entry: MailboxEntry): Promise<MailboxBody> {
  const visibility = mailCarriesMagicLink(entry) ? await magicLinkMayBeShown(entry.toEmail) : null;
  return mailboxBody(entry, visibility);
}

/**
 * A token in an SMS is a session as the phone's owner. Resolve exactly one owner, then ask the same
 * demo-access policy as the email archive using the channel that actually carried this message.
 * Missing and duplicate phone matches both fail closed inside `emailForSmsRecipient`.
 */
async function renderableSmsBody(
  entry: SmsMailboxEntry,
  transport: ReturnType<typeof activeSmsTransportName>,
): Promise<SmsMailboxBody> {
  if (!smsCarriesMagicLink(entry)) return smsMailboxBody(entry, null);
  const recipientEmail = await emailForSmsRecipient(entry.toPhone);
  const visibility = recipientEmail ? await magicLinkMayBeShown(recipientEmail, transport) : null;
  return smsMailboxBody(entry, visibility);
}

const CHANNEL_TABS: Array<{ id: SentFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'email', label: 'Email' },
  { id: 'sms', label: 'SMS' },
];

export default async function SentPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; q?: string; id?: string; channel?: string }>;
}) {
  const params = await searchParams;
  const actor = await requireCurrentActor();
  const { event, options } = await resolveOrganizerEvent({
    eventParam: params.event ?? null,
    cookieEventId: await currentEventIdHint(),
    userId: actor.userId,
  });

  const channel: SentFilter = isSentFilter(params.channel) ? params.channel : 'all';
  const search = params.q ?? null;
  const scope = { eventId: event?.id ?? null, search, limit: LIMIT };

  const [mail, sms] = await Promise.all([
    channel === 'sms' ? Promise.resolve([]) : listMail(scope),
    channel === 'email' ? Promise.resolve([]) : listSms(scope),
  ]);

  /**
   * `smsMailboxBody(entry, null)` is the fully-redacted read, which is the only safe one here: the
   * list renders every row at once and cannot run a per-recipient visibility check for each. Never
   * put an unredacted body in this projection.
   */
  const messages = mergeSent(
    [mail.map(mailToSent), sms.map((entry) => smsToSent(entry, smsMailboxBody(entry, null).body))],
    LIMIT,
  );

  const selection = parseSentKey(params.id) ?? (messages[0] ? parseSentKey(messages[0].key) : null);

  const smsTransport = activeSmsTransportName();
  const selectedMail =
    event && selection?.channel === 'email' ? await getMail(event.id, selection.id) : undefined;
  const selectedSms =
    event && selection?.channel === 'sms' ? await getSms(event.id, selection.id) : undefined;
  const mailBody = selectedMail ? await renderableMailBody(selectedMail) : undefined;
  const smsBody = selectedSms ? await renderableSmsBody(selectedSms, smsTransport) : undefined;
  const selectedKey = selectedMail
    ? `email:${selectedMail.id}`
    : selectedSms
      ? `sms:${selectedSms.id}`
      : undefined;

  const href = (next: { id?: string; channel?: SentFilter }) => {
    const query = new URLSearchParams();
    if (event) query.set('event', event.slug);
    const nextChannel = next.channel ?? channel;
    if (nextChannel !== 'all') query.set('channel', nextChannel);
    if (search) query.set('q', search);
    if (next.id) query.set('id', next.id);
    return `/organizer/sent?${query.toString()}`;
  };

  const mailTransport = activeTransportName();
  const logging = mailTransport === 'log' || smsTransport === 'log';

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Communications</p>
          <h1 className={styles.title}>Sent</h1>
          <p className={styles.lede}>Every email and text this event has sent or attempted.</p>
        </div>
        <div className={styles.headerActions}>
          {event && <EventPicker current={event.slug} options={options} basePath="/organizer/sent" />}
        </div>
      </div>

      <CommsTabs active="sent" eventSlug={event?.slug} />

      <div className={styles.row}>
        <Badge tone={mailTransport === 'log' ? 'info' : 'success'}>email: {mailTransport}</Badge>
        <Badge tone={smsTransport === 'log' ? 'info' : 'success'}>sms: {smsTransport}</Badge>
        {logging && (
          <span className={styles.subtle}>
            Development mode: messages are recorded here, not delivered.
          </span>
        )}
        <span className={styles.spacer} />
        <RunRemindersButton />
      </div>

      <div className={styles.mailbox}>
        <div className={styles.mailList}>
          {/* The channel is a filter over one list, not a route: the selection and search survive it. */}
          <nav className={styles.channelFilter} aria-label="Channel">
            {CHANNEL_TABS.map((tab) => (
              <Link
                key={tab.id}
                href={href({ channel: tab.id })}
                className={`${styles.channelOption} ${tab.id === channel ? styles.channelOptionActive : ''}`}
                aria-current={tab.id === channel ? 'true' : undefined}
              >
                {tab.label}
              </Link>
            ))}
          </nav>

          <SentSearch initial={params.q ?? ''} eventSlug={event?.slug} channel={channel} />

          {messages.length === 0 && (
            <p className={styles.empty}>
              <Inbox size={20} />
              {channel === 'email'
                ? 'No email yet.'
                : channel === 'sms'
                  ? 'No texts yet.'
                  : 'Nothing sent yet.'}
            </p>
          )}

          {messages.map((message) => (
            <Link
              key={message.key}
              href={href({ id: message.key })}
              className={`${styles.mailItem} ${selectedKey === message.key ? styles.mailItemActive : ''}`}
            >
              <span className={styles.mailItemTop}>
                <span className={styles.mailTo}>
                  {/* Under "All" the icon is what tells an address from a number at a glance. */}
                  <span
                    className={styles.channelIcon}
                    aria-label={message.channel === 'email' ? 'Email' : 'SMS'}
                    role="img"
                  >
                    {message.channel === 'email' ? <Mail size={12} /> : <MessageSquare size={12} />}
                  </span>
                  <span className={styles.mailToText}>{message.to}</span>
                </span>
                <span className={styles.mailWhen}>{when(message.createdAt)}</span>
              </span>
              <span className={styles.mailSubject}>{message.preview}</span>
              <span className={styles.mailBadges}>
                <Badge tone={statusTone(message.status)}>{message.status}</Badge>
                {message.templateKey && <Badge>{message.templateKey}</Badge>}
                {message.hasCalendar && <Badge tone="accent">calendar</Badge>}
              </span>
            </Link>
          ))}
        </div>

        <div className={styles.mailDetail}>
          {!selectedMail && !selectedSms && (
            <p className={styles.empty}>
              <Inbox size={20} />
              Choose a message.
            </p>
          )}

          {selectedMail && mailBody && (
            <>
              <div>
                <h2 className={styles.previewSubject}>{selectedMail.subject}</h2>
                <div className={styles.mailHeaders}>
                  <span className={styles.mailHeaderKey}>Channel</span>
                  <span className={styles.mailHeaderValue}>Email</span>
                  <span className={styles.mailHeaderKey}>To</span>
                  <span className={styles.mailHeaderValue}>{selectedMail.toEmail}</span>
                  <span className={styles.mailHeaderKey}>From</span>
                  <span className={styles.mailHeaderValue}>{selectedMail.fromEmail}</span>
                  <span className={styles.mailHeaderKey}>Sent</span>
                  <span className={styles.mailHeaderValue}>
                    {selectedMail.sentAt ? when(selectedMail.sentAt) : 'not dispatched'}
                  </span>
                  <span className={styles.mailHeaderKey}>Template</span>
                  <span className={styles.mailHeaderValue}>{selectedMail.templateKey ?? '—'}</span>
                  <span className={styles.mailHeaderKey}>Status</span>
                  <span className={styles.mailHeaderValue}>
                    <Badge tone={statusTone(selectedMail.status)}>{selectedMail.status}</Badge>
                  </span>
                </div>
              </div>

              {selectedMail.error && (
                <p className={`${styles.warning} ${styles.danger}`}>{selectedMail.error}</p>
              )}

              {selectedMail.icsBody && (
                <Card>
                  <CardBody>
                    <div className={styles.row}>
                      <CalendarDays size={16} />
                      <strong>Calendar invitation attached</strong>
                      <span className={styles.spacer} />
                      <a
                        className={styles.variableChip}
                        href={`/api/mail/${selectedMail.id}/ics`}
                        download
                      >
                        <Download size={13} /> Download .ics
                      </a>
                    </div>
                    <pre className={styles.plainText}>{selectedMail.icsBody}</pre>
                  </CardBody>
                </Card>
              )}

              {mailBody.redacted && (
                <p className={styles.notice}>
                  <ShieldCheck size={16} />
                  <span>
                    This message carried a sign-in link for {selectedMail.toEmail}, and it has been
                    withheld. That link is a session as that person, so it is readable only by them,
                    in the copy that was delivered.
                  </span>
                </p>
              )}

              {mailBody.links.length > 0 && (
                <Card>
                  <CardBody>
                    <div className={styles.row}>
                      <Link2 size={16} />
                      <strong>Links in this message</strong>
                    </div>
                    <div className={styles.linkList} style={{ marginTop: 'var(--space-2)' }}>
                      {mailBody.links.map((link) => (
                        <a key={link} href={link}>
                          {link}
                        </a>
                      ))}
                    </div>
                  </CardBody>
                </Card>
              )}

              <div
                className={styles.mailBody}
                dangerouslySetInnerHTML={{ __html: mailBody.bodyHtml }}
              />

              <details>
                <summary className={styles.subtle}>Plain-text part</summary>
                <pre className={styles.plainText}>{mailBody.bodyText}</pre>
              </details>
            </>
          )}

          {selectedSms && smsBody && (
            <>
              <div>
                <h2 className={styles.previewSubject}>{selectedSms.toPhone}</h2>
                <div className={styles.mailHeaders}>
                  <span className={styles.mailHeaderKey}>Channel</span>
                  <span className={styles.mailHeaderValue}>SMS</span>
                  <span className={styles.mailHeaderKey}>To</span>
                  <span className={styles.mailHeaderValue}>{selectedSms.toPhone}</span>
                  <span className={styles.mailHeaderKey}>From</span>
                  <span className={styles.mailHeaderValue}>{selectedSms.fromPhone}</span>
                  <span className={styles.mailHeaderKey}>Sent</span>
                  <span className={styles.mailHeaderValue}>
                    {selectedSms.sentAt ? when(selectedSms.sentAt) : 'not dispatched'}
                  </span>
                  <span className={styles.mailHeaderKey}>Template</span>
                  <span className={styles.mailHeaderValue}>{selectedSms.templateKey ?? '—'}</span>
                  <span className={styles.mailHeaderKey}>Status</span>
                  <span className={styles.mailHeaderValue}>
                    <Badge tone={statusTone(selectedSms.status)}>{selectedSms.status}</Badge>
                  </span>
                </div>
              </div>

              {selectedSms.error && (
                <p className={`${styles.warning} ${styles.danger}`}>{selectedSms.error}</p>
              )}

              {smsBody.redacted && (
                <p className={styles.notice}>
                  <ShieldCheck size={16} />
                  <span>
                    This text carried a sign-in link for {selectedSms.toPhone}, and it has been
                    withheld. That link is a session as that person, so this archive shows it only
                    when Cicero can identify the recipient and the configured delivery policy
                    permits it.
                  </span>
                </p>
              )}

              <pre className={styles.plainText}>{smsBody.body}</pre>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
