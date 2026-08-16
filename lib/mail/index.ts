import { eq } from 'drizzle-orm';
import { getDb } from '../../db/client';
import { emailLog } from '../../db/schema';
import { env } from '../env';
import { resolveMailTransport, undeliverableRecipient } from './config';
import { logTransport } from './log';
import { redactSensitiveMailLinks } from './redact';
import { prepareEventMail } from '../services/notification-preferences';
import { resendTransport } from './resend';
import { smtpTransport } from './smtp';
import type { MailTransport, OutgoingMail } from './transport';

export type { MailTransport, OutgoingIcs, OutgoingMail } from './transport';
export { undeliverableRecipient } from './config';

/**
 * One warning per distinct misconfiguration per process. `selectTransport` runs on every send and on
 * every render of the organizer mailbox banner, and a line repeated per email is a line nobody reads.
 */
const warned = new Set<string>();

function warnOnce(message: string): void {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(message);
}

function selectTransport(): MailTransport {
  const resolved = resolveMailTransport();
  // Falling back rather than throwing is deliberate: a missing key should degrade to the dev
  // mailbox, not take down acceptance emails and every magic link with them. Falling back
  // *quietly* is not — an operator who asked for a real transport has to hear that they did not
  // get one, or `/organizer/mail` reads as a sent inbox for mail that never left the machine.
  if (resolved.transport === 'resend') {
    warnOnSharedResendSender();
    return resendTransport(resolved.apiKey);
  }
  if (resolved.transport === 'smtp') return smtpTransport(resolved.smtp, resolved.allowInsecure);
  if (resolved.warning) warnOnce(resolved.warning);
  return logTransport();
}

/**
 * `onboarding@resend.dev` is the sender a Resend account starts with, and it delivers to the account
 * owner and to nobody else — every other recipient is refused with a 403. A key plus that sender is
 * therefore a configuration that looks complete, warns about nothing, and drops every message to
 * every speaker on the floor. Verify a domain and point `MAIL_FROM` at it.
 */
function warnOnSharedResendSender(): void {
  const from = env('MAIL_FROM') ?? '';
  if (!/@resend\.dev\b/i.test(from)) return;
  warnOnce(
    `MAIL_FROM is ${from}, Resend's shared test sender. It delivers only to the Resend account ` +
      'owner and 403s every other recipient. Verify a domain in Resend and set MAIL_FROM to an ' +
      'address at it.',
  );
}

/**
 * The transport this recipient gets. Almost always the configured one — the exception is an address
 * at a reserved domain, which no provider can deliver to and which a real provider will hard-bounce,
 * charging the bounce against the sender's reputation. The seeded demo is six hundred such
 * addresses. They go to the dev mailbox no matter what is configured; real recipients in the same
 * run still get real mail.
 */
function transportFor(to: string): MailTransport {
  return undeliverableRecipient(to) ? logTransport() : selectTransport();
}

export type SendMailInput = Omit<OutgoingMail, 'from'> & {
  from?: string;
  eventId?: string | null;
  templateKey?: string | null;
};

type LoggedCopy = Pick<OutgoingMail, 'subject' | 'html' | 'text'> & { ics: string | null };

/**
 * What goes into `email_log`, which is not always what goes out on the wire.
 *
 * A message body can carry a `/auth/verify?token=…` — a live, single-use session as the recipient
 * (see `./redact.ts`). `/organizer/mail` already refuses to *render* one to a reader who is not entitled
 * to it, but that gate is at read time, and the token is still sitting in the table underneath it
 * for anyone with database access, a backup, or a replica.
 *
 * The narrow thing that can be done about it without a query is this: **keep the token only where
 * the log transport handled the send.** The two cases divide cleanly.
 *
 *  - Log transport. The stored row *is* the delivered message — there is no inbox anywhere else, and
 *    `T-7a` (a judge signs in on a deployment where they have no mailbox) is exactly that row being
 *    readable. Stripping the token here breaks the demo. Keep it.
 *  - Any real transport. The provider has already delivered the recipient their own copy, which is
 *    the only copy that has to work. A second live credential in `email_log` buys nothing and costs
 *    a credential at rest. Redact it.
 *
 * Which of those applies is **per recipient**, not per deployment: `transportFor` routes reserved
 * domains to the log transport whatever is configured, so under a live Resend key the seeded demo
 * keeps its readable links in the same run that redacts a real speaker's. This function is therefore
 * given the transport that actually handled *this* address, and never asks the environment itself.
 *
 * Redacting before dispatch rather than after means a send that then fails is redacted too. That is
 * deliberate and matches `lib/demo-access.ts`: a bounce is not evidence that the reader of the
 * mailbox is entitled to a session as the recipient. Re-triggering the send mints a fresh token.
 *
 * The audit trail is untouched — the row, the recipient, the subject, the timestamp, the status and
 * the whole body all stay. One query parameter inside one URL reads `redacted`.
 *
 * **Rows written before this shipped still hold their tokens.** They are left alone: removing them
 * needs a migration, and this workstream cannot add one. They stay covered by the read-time gate in
 * `app/organizer/mail/magic-links.ts`, which is what has been protecting them all along, and every token
 * in them expires on its own schedule. An operator who wants them gone now can do it in one
 * statement, which is safe to run repeatedly and touches nothing but the token:
 *
 * ```sql
 * UPDATE email_log
 *    SET body_html = regexp_replace(body_html, '(/auth/verify\?[^"''<>\s]*token=)[^"''<>\s&]+', '\1redacted', 'gi'),
 *        body_text = regexp_replace(body_text, '(/auth/verify\?[^"''<>\s]*token=)[^"''<>\s&]+', '\1redacted', 'gi')
 *  WHERE body_html ~* '/auth/verify\?[^"''<>\s]*token='
 *     OR body_text ~* '/auth/verify\?[^"''<>\s]*token=';
 * ```
 *
 * On a demo instance, don't: that is the judge's inbox.
 */
function loggedCopy(input: SendMailInput, transport: MailTransport['name']): LoggedCopy {
  const ics = input.ics?.body ?? null;
  if (transport === 'log') {
    return { subject: input.subject, html: input.html, text: input.text, ics };
  }
  return {
    subject: redactSensitiveMailLinks(input.subject),
    html: redactSensitiveMailLinks(input.html),
    text: redactSensitiveMailLinks(input.text),
    ics: ics === null ? null : redactSensitiveMailLinks(ics),
  };
}

/**
 * The single send path. The message is written to `email_log` *before* dispatch, so a message that
 * the provider rejects is still readable at `/organizer/mail` with its error attached — the log is the
 * record of intent, not a record of success. Everything is written except a sign-in token that a
 * real transport is about to deliver to the recipient itself; `loggedCopy` explains why.
 *
 * Never throws. A failed send marks the row and returns; no caller should lose an accepted
 * submission because a mail provider was down.
 *
 * `sent: true` means the transport that handled this recipient accepted it, which for a reserved
 * domain means the dev mailbox took it. Callers must not read it as "this reached a person".
 */
export async function sendMail(input: SendMailInput): Promise<{ id: string; sent: boolean }> {
  const db = getDb();
  let preparationError: unknown = null;
  let preparedEventMail: Pick<SendMailInput, 'html' | 'text'> & { allowed: boolean } = {
    ...input,
    allowed: true,
  };
  try {
    preparedEventMail = await prepareEventMail(input);
  } catch (error) {
    // A notification must not leave without the preference link it promised. Log the intent below
    // and fail it through the ordinary transport-error path, preserving `sendMail`'s never-throw
    // contract while failing closed.
    preparationError = error;
  }
  const prepared = { ...input, ...preparedEventMail };
  const transport = transportFor(prepared.to);
  const from = prepared.from ?? env('MAIL_FROM') ?? 'Cicero <cicero@localhost>';
  const logged = loggedCopy(prepared, transport.name);

  const [row] = await db
    .insert(emailLog)
    .values({
      eventId: prepared.eventId ?? null,
      toEmail: prepared.to,
      fromEmail: from,
      subject: logged.subject,
      bodyHtml: logged.html,
      bodyText: logged.text,
      templateKey: prepared.templateKey ?? null,
      icsBody: logged.ics,
      status: 'queued',
    })
    .returning({ id: emailLog.id });

  try {
    if (preparationError) throw preparationError;
    if (!prepared.allowed) {
      throw new Error('Email suppressed: the recipient opted out of this notification');
    }
    const result = await transport.send({ ...prepared, from });
    await db
      .update(emailLog)
      .set({
        status: 'sent',
        sentAt: new Date(),
        providerMessageId: result.providerMessageId ?? null,
      })
      .where(eq(emailLog.id, row.id));
    return { id: row.id, sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    await db.update(emailLog).set({ status: 'failed', error: message }).where(eq(emailLog.id, row.id));
    return { id: row.id, sent: false };
  }
}

/** Which transport is live, for the organizer mailbox banner and the deployment checklist. */
export function activeTransportName(): MailTransport['name'] {
  return selectTransport().name;
}
