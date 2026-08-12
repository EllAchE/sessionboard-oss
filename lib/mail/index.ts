import { eq } from 'drizzle-orm';
import { getDb } from '../../db/client';
import { emailLog } from '../../db/schema';
import { env, envFlag } from '../env';
import { logTransport } from './log';
import { resendTransport } from './resend';
import { smtpTransport } from './smtp';
import type { MailTransport, OutgoingMail } from './transport';

export type { MailTransport, OutgoingMail } from './transport';

function selectTransport(): MailTransport {
  const configured = env('MAIL_TRANSPORT') ?? 'log';
  if (configured === 'resend') {
    const key = env('RESEND_API_KEY');
    // Falling back rather than throwing is deliberate: a missing key should degrade to the dev
    // mailbox, not take down acceptance emails and every magic link with them.
    return key ? resendTransport(key) : logTransport();
  }
  if (configured === 'smtp') {
    const url = env('SMTP_URL');
    return url ? smtpTransport(url, envFlag('SMTP_ALLOW_INSECURE')) : logTransport();
  }
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
      icsBody: input.ics ?? null,
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
