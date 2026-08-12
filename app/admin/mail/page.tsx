import Link from 'next/link';
import { CalendarDays, Download, Inbox, Link2 } from 'lucide-react';
import { Badge, Card, CardBody } from '@/components/ui';
import { requireCurrentActor } from '@/lib/auth';
import { activeTransportName } from '@/lib/mail';
import { getMail, listMail, resolveAdminEvent } from '@/lib/services/comms';
import { CommsTabs } from '../comms/CommsTabs';
import { EventPicker } from '../comms/EventPicker';
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
 * Pulls every href out of the rendered body. A magic link is the one thing a judge must be able to
 * click, and hunting for it inside a branded HTML table is exactly the friction `T-7a` exists to
 * remove.
 */
function linksIn(html: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(/href="([^"]+)"/g)) {
    const href = match[1].replace(/&amp;/g, '&');
    if (href.startsWith('http') || href.startsWith('/')) found.add(href);
  }
  return [...found];
}

export default async function MailboxPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; q?: string; id?: string }>;
}) {
  const params = await searchParams;
  const actor = await requireCurrentActor();
  const { event, options } = await resolveAdminEvent({
    eventParam: params.event ?? null,
    userId: actor.userId,
  });

  const messages = await listMail({
    eventId: event?.id ?? null,
    search: params.q ?? null,
    limit: 200,
  });

  const selectedId = params.id ?? messages[0]?.id;
  const selected = event && selectedId ? await getMail(event.id, selectedId) : undefined;

  const transport = activeTransportName();
  const query = (id: string) => {
    const next = new URLSearchParams();
    if (event) next.set('event', event.slug);
    if (params.q) next.set('q', params.q);
    next.set('id', id);
    return `/admin/mail?${next.toString()}`;
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Communications</p>
          <h1 className={styles.title}>Mailbox</h1>
          <p className={styles.lede}>
            Every message this instance has sent or tried to send, with its rendered body, its
            calendar attachment and any error the provider returned.
          </p>
        </div>
        <div className={styles.headerActions}>
          {event && <EventPicker current={event.slug} options={options} basePath="/admin/mail" />}
        </div>
      </div>

      <CommsTabs active="mail" eventSlug={event?.slug} />

      <div className={styles.row}>
        <Badge tone={transport === 'log' ? 'info' : 'success'}>transport: {transport}</Badge>
        {transport === 'log' && (
          <span className={styles.subtle}>
            Nothing leaves the server. Everything a speaker would have received is readable here.
          </span>
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
              No mail yet. Accept a submission or send a message from Compose.
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

          {selected && (
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

              {linksIn(selected.bodyHtml).length > 0 && (
                <Card>
                  <CardBody>
                    <div className={styles.row}>
                      <Link2 size={16} />
                      <strong>Links in this message</strong>
                    </div>
                    <div className={styles.linkList} style={{ marginTop: 'var(--space-2)' }}>
                      {linksIn(selected.bodyHtml).map((href) => (
                        <a key={href} href={href}>
                          {href}
                        </a>
                      ))}
                    </div>
                  </CardBody>
                </Card>
              )}

              <div
                className={styles.mailBody}
                dangerouslySetInnerHTML={{ __html: selected.bodyHtml }}
              />

              <details>
                <summary className={styles.subtle}>Plain-text part</summary>
                <pre className={styles.plainText}>{selected.bodyText}</pre>
              </details>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
