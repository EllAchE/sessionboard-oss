import Link from 'next/link';
import { CalendarDays, Download, Inbox, Link2, ShieldCheck } from 'lucide-react';
import { Badge, Card, CardBody } from '@/components/ui';
import { magicLinkMayBeShown, requireCurrentActor } from '@/lib/auth';
import { currentEventIdHint } from '@/lib/services/events';
import { activeTransportName } from '@/lib/mail';
import { getMail, listMail, resolveOrganizerEvent, type MailboxEntry } from '@/lib/services/comms';
import { CommsTabs } from '../comms/CommsTabs';
import { EventPicker } from '../comms/EventPicker';
import { carriesMagicLink, mailboxBody, type MailboxBody } from './magic-links';
import { MailSearch } from './MailSearch';
import { RunRemindersButton } from './RunRemindersButton';
import styles from '../comms/comms.module.css';

/**
 * `T-7a` and `C-5`. `MAIL_TRANSPORT=log` is the default, so on the demo deployment this page is the
 * *only* place email exists — a judge who never checks an inbox opens the acceptance email here,
 * clicks the magic link inside it, and downloads the calendar invite.
 *
 * It is therefore a product surface, not a debug tool: every message is fully rendered, every link
 * in it is extracted and clickable, and the `.ics` is downloadable as its own file.
 *
 * With one exception, and it is a security boundary rather than a preference: a body can carry a
 * live sign-in token, `sendMail` writes that body to `email_log` before dispatch under *every*
 * transport, and the reader of this page is not always the person the token belongs to. Which
 * tokens may be rendered is decided by `./magic-links.ts`, which explains the escalation, and
 * ultimately by `lib/demo-access.ts`, which owns the rule.
 */
export const dynamic = 'force-dynamic';

const STATUS_TONE = {
  queued: 'neutral',
  sent: 'success',
  failed: 'danger',
} as const;

function when(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

/**
 * The body as this reader is allowed to see it. `magicLinkMayBeShown` is only asked when the body
 * actually carries a sign-in token, so an ordinary acceptance email costs no extra queries — and a
 * body with no credential in it is never gated on anything.
 */
async function renderableBody(entry: MailboxEntry): Promise<MailboxBody> {
  const visibility = carriesMagicLink(entry) ? await magicLinkMayBeShown(entry.toEmail) : null;
  return mailboxBody(entry, visibility);
}

export default async function MailboxPage({
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

  const messages = await listMail({
    eventId: event?.id ?? null,
    search: params.q ?? null,
    limit: 200,
  });

  const selectedId = params.id ?? messages[0]?.id;
  const selected = event && selectedId ? await getMail(event.id, selectedId) : undefined;
  const body = selected ? await renderableBody(selected) : undefined;

  const transport = activeTransportName();
  const query = (id: string) => {
    const next = new URLSearchParams();
    if (event) next.set('event', event.slug);
    if (params.q) next.set('q', params.q);
    next.set('id', id);
    return `/organizer/mail?${next.toString()}`;
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Communications</p>
          <h1 className={styles.title}>Email</h1>
          <p className={styles.lede}>Sent and attempted email for this event.</p>
        </div>
        <div className={styles.headerActions}>
          {event && <EventPicker current={event.slug} options={options} basePath="/organizer/mail" />}
        </div>
      </div>

      <CommsTabs active="mail" eventSlug={event?.slug} />

      <div className={styles.row}>
        <Badge tone={transport === 'log' ? 'info' : 'success'}>transport: {transport}</Badge>
        {transport === 'log' && (
          <span className={styles.subtle}>Development mode: messages are recorded here, not delivered.</span>
        )}
        <span className={styles.spacer} />
        <RunRemindersButton />
      </div>

      <div className={styles.mailbox}>
        <div className={styles.mailList}>
          <MailSearch initial={params.q ?? ''} eventSlug={event?.slug} />
          {messages.length === 0 && (
            <p className={styles.empty}>
              <Inbox size={20} />
              No mail yet.
            </p>
          )}
          {messages.map((message) => (
            <Link
              key={message.id}
              href={query(message.id)}
              className={`${styles.mailItem} ${selected?.id === message.id ? styles.mailItemActive : ''}`}
            >
              <span className={styles.mailItemTop}>
                <span className={styles.mailTo}>{message.toEmail}</span>
                <span className={styles.mailWhen}>{when(message.createdAt)}</span>
              </span>
              <span className={styles.mailSubject}>{message.subject}</span>
              <span className={styles.mailBadges}>
                <Badge tone={STATUS_TONE[message.status]}>{message.status}</Badge>
                {message.templateKey && <Badge>{message.templateKey}</Badge>}
                {message.icsBody && <Badge tone="accent">calendar</Badge>}
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
                <h2 className={styles.previewSubject}>{selected.subject}</h2>
                <div className={styles.mailHeaders}>
                  <span className={styles.mailHeaderKey}>To</span>
                  <span className={styles.mailHeaderValue}>{selected.toEmail}</span>
                  <span className={styles.mailHeaderKey}>From</span>
                  <span className={styles.mailHeaderValue}>{selected.fromEmail}</span>
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

              {selected.icsBody && (
                <Card>
                  <CardBody>
                    <div className={styles.row}>
                      <CalendarDays size={16} />
                      <strong>Calendar invitation attached</strong>
                      <span className={styles.spacer} />
                      <a
                        className={styles.variableChip}
                        href={`/api/mail/${selected.id}/ics`}
                        download
                      >
                        <Download size={13} /> Download .ics
                      </a>
                    </div>
                    <pre className={styles.plainText}>{selected.icsBody}</pre>
                  </CardBody>
                </Card>
              )}

              {body.redacted && (
                <p className={styles.notice}>
                  <ShieldCheck size={16} />
                  <span>
                    This message carried a sign-in link for {selected.toEmail}, and it has been
                    withheld. That link is a session as that person, so it is readable only by them,
                    in the copy that was delivered.
                  </span>
                </p>
              )}

              {body.links.length > 0 && (
                <Card>
                  <CardBody>
                    <div className={styles.row}>
                      <Link2 size={16} />
                      <strong>Links in this message</strong>
                    </div>
                    <div className={styles.linkList} style={{ marginTop: 'var(--space-2)' }}>
                      {body.links.map((href) => (
                        <a key={href} href={href}>
                          {href}
                        </a>
                      ))}
                    </div>
                  </CardBody>
                </Card>
              )}

              <div className={styles.mailBody} dangerouslySetInnerHTML={{ __html: body.bodyHtml }} />

              <details>
                <summary className={styles.subtle}>Plain-text part</summary>
                <pre className={styles.plainText}>{body.bodyText}</pre>
              </details>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
