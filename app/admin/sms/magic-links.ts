import type { LinkVisibility } from '@/lib/demo-access';
import { hasMagicLink, isRedacted, redactMagicLinks } from '@/lib/mail/redact';

/** Whether an SMS archive row carries a session credential and needs the account lookup. */
export function carriesMagicLink(entry: { body: string }): boolean {
  return hasMagicLink(entry.body);
}

export type SmsMailboxBody = {
  body: string;
  redacted: boolean;
};

/**
 * Applies the same read-time boundary as the mail archive to the SMS archive's single text body.
 * `null` means the recipient is not entitled to an organizer-readable copy of the credential.
 */
export function smsMailboxBody(
  entry: { body: string },
  visibility: LinkVisibility,
): SmsMailboxBody {
  const body = visibility === null ? redactMagicLinks(entry.body) : entry.body;
  return { body, redacted: isRedacted(body) };
}
