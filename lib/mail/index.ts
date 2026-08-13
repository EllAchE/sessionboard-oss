import { eq } from 'drizzle-orm';
import { getDb } from '../../db/client';
import { emailLog } from '../../db/schema';
import { env } from '../env';
import { resolveMailTransport, undeliverableRecipient } from './config';
import { logTransport } from './log';
import { resendTransport } from './resend';
import { smtpTransport } from './smtp';
import type { MailTransport, OutgoingMail } from './transport';

export type { MailTransport, OutgoingIcs, OutgoingMail } from './transport';
export { undeliverableRecipient } from './config';

/**
 * One warning per distinct misconfiguration per process. `selectTransport` runs on every send and on
 * every render of the admin mailbox banner, and a line repeated per email is a line nobody reads.
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
  // get one, or `/admin/mail` reads as a sent inbox for mail that never left the machine.
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

/**
 * The single send path. Everything is written to `email_log` *before* dispatch, so a message that
 * the provider rejects is still readable at `/admin/mail` with its error attached — the log is the
 * record of intent, not a record of success.
 *
 * Never throws. A failed send marks the row and returns; no caller should lose an accepted
 * submission because a mail provider was down.
 *
 * `sent: true` means the transport that handled this recipient accepted it, which for a reserved
 * domain means the dev mailbox took it. Callers must not read it as "this reached a person".
 */
export async function sendMail(input: SendMailInput): Promise<{ id: string; sent: boolean }> {
  const db = getDb();
  const transport = transportFor(input.to);
  const from = input.from ?? env('MAIL_FROM') ?? 'Cicero <cicero@localhost>';

  const [row] = await db
    .insert(emailLog)
    .values({
      eventId: input.eventId ?? null,
      toEmail: input.to,
      fromEmail: from,
      subject: input.subject,
      bodyHtml: input.html,
      bodyText: input.text,
      templateKey: input.templateKey ?? null,
      icsBody: input.ics?.body ?? null,
      status: 'queued',
    })
    .returning({ id: emailLog.id });

  try {
    const result = await transport.send({ ...input, from });
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

/** Which transport is live, for the admin mailbox banner and the deployment checklist. */
export function activeTransportName(): MailTransport['name'] {
  return selectTransport().name;
}
