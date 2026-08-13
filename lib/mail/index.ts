import { eq } from 'drizzle-orm';
import { getDb } from '../../db/client';
import { emailLog } from '../../db/schema';
import { env } from '../env';
import { resolveMailTransport } from './config';
import { logTransport } from './log';
import { resendTransport } from './resend';
import { smtpTransport } from './smtp';
import type { MailTransport, OutgoingMail } from './transport';

export type { MailTransport, OutgoingIcs, OutgoingMail } from './transport';

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
  if (resolved.transport === 'resend') return resendTransport(resolved.apiKey);
  if (resolved.transport === 'smtp') return smtpTransport(resolved.smtp, resolved.allowInsecure);
  if (resolved.warning) warnOnce(resolved.warning);
  return logTransport();
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
 */
export async function sendMail(input: SendMailInput): Promise<{ id: string; sent: boolean }> {
  const db = getDb();
  const transport = selectTransport();
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
