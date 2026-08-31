'use client';

import { CalendarDays, KeyRound, Link2, ShieldCheck } from 'lucide-react';
import { Badge, Button, Dialog } from '@/components/ui';
import type { SimulatedMessage } from '@/lib/services/comms-simulator';
import styles from './CommsSimulator.module.css';

/**
 * The message behind a simulated-delivery toast, as the recipient would have received it.
 *
 * The email body is injected the same way `/organizer/sent` injects it, and for the same reason:
 * under the log transport this rendering *is* the delivered message, and a speaker's acceptance
 * email read as escaped source is not a preview of anything. The body arrives already redacted —
 * `lib/services/comms-simulator.ts` runs it through the archive's own gate before it leaves the
 * server, so there is no policy decision left to make here.
 */

function when(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

export function SimulatedMessageDialog({
  message,
  onClose,
}: {
  message: SimulatedMessage | null;
  onClose: () => void;
}) {
  if (!message) return null;

  const failed = message.status === 'failed';
  const isEmail = message.channel === 'email';

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="lg"
      title={isEmail ? (message.subject ?? '(no subject)') : `SMS to ${message.to}`}
      description={
        failed
          ? `This message failed before it could be handed over: ${message.error ?? 'the transport refused it'}`
          : 'Simulated delivery. The message was recorded but no provider is configured, so nothing left the server.'
      }
      footer={
        <div className={styles.footer}>
          {message.hasIcs ? (
            <Button href={`/api/mail/${message.id}/ics`} iconLeft={<CalendarDays size={14} />}>
              Download invite
            </Button>
          ) : null}
          {message.audience === 'organizer' ? (
            <Button
              href={`/organizer/sent?channel=${message.channel}&id=${message.channel}:${message.id}`}
              variant="ghost"
            >
              Open in the message log
            </Button>
          ) : null}
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <dl className={styles.headers}>
        <dt>To</dt>
        <dd>
          {message.to}
          {message.audience === 'recipient' ? <Badge tone="accent">You</Badge> : null}
        </dd>
        <dt>From</dt>
        <dd>{message.from || '(no sender configured)'}</dd>
        <dt>Sent</dt>
        <dd>
          {when(message.createdAt)}
          <Badge tone={failed ? 'danger' : 'neutral'}>{message.status}</Badge>
          {message.templateKey ? <Badge tone="neutral">{message.templateKey}</Badge> : null}
        </dd>
      </dl>

      {message.signInLink ? (
        <p className={styles.callout}>
          <KeyRound size={14} aria-hidden="true" />
          <span>
            This message carries a sign-in link.{' '}
            <a href={message.signInLink}>Open it</a> to continue as {message.to}.
          </span>
        </p>
      ) : null}

      {message.redacted ? (
        <p className={styles.callout}>
          <ShieldCheck size={14} aria-hidden="true" />
          <span>
            A sign-in link in this message is withheld from you. The recipient&rsquo;s own copy has
            it.
          </span>
        </p>
      ) : null}

      {isEmail && message.bodyHtml ? (
        <div className={styles.rendered} dangerouslySetInnerHTML={{ __html: message.bodyHtml }} />
      ) : (
        <pre className={styles.plain}>{message.bodyText}</pre>
      )}

      {message.links.length > 0 ? (
        <ul className={styles.links}>
          {message.links.map((href) => (
            <li key={href}>
              <Link2 size={12} aria-hidden="true" />
              <a href={href}>{href}</a>
            </li>
          ))}
        </ul>
      ) : null}
    </Dialog>
  );
}
