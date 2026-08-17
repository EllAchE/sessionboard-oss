import type { MailboxEntry, SmsMailboxEntry } from '@/lib/services/comms';

/**
 * The list model behind `/organizer/sent`, and the reason that screen can show two tables at once.
 *
 * `email_log` and `sms_log` share a shape but not a schema: one has a subject and an optional
 * calendar part, the other has a body and a wider status vocabulary. Rather than teach the list to
 * branch on every field, both are projected onto the row below and the branch happens once, here.
 * The *detail* pane still branches — an email is genuinely a different object to read than a text —
 * but "who did this go to, when, and did it land" is the same question either way.
 *
 * Nothing in this module reads the database or the request. It is pure so the merge and the
 * selection round-trip can be tested without either.
 */

export type SentChannel = 'email' | 'sms';

export const SENT_CHANNELS: readonly SentChannel[] = ['email', 'sms'];

/** What the list shows for a filter, including the unfiltered default. */
export type SentFilter = SentChannel | 'all';

export function isSentFilter(value: string | null | undefined): value is SentFilter {
  return value === 'all' || value === 'email' || value === 'sms';
}

/**
 * One map for both channels. `email_log` only ever writes queued/sent/failed and `sms_log` adds
 * delivered/undelivered, and the three they share mean the same thing in both — so the union is a
 * merge rather than a compromise.
 */
export const SENT_STATUS_TONE = {
  queued: 'neutral',
  sent: 'success',
  delivered: 'success',
  undelivered: 'danger',
  failed: 'danger',
} as const;

export type SentStatusTone = (typeof SENT_STATUS_TONE)[keyof typeof SENT_STATUS_TONE];

export function statusTone(status: string): SentStatusTone {
  return SENT_STATUS_TONE[status as keyof typeof SENT_STATUS_TONE] ?? 'neutral';
}

export type SentMessage = {
  /** `channel:id`. Unique across both tables, which a bare row id is not. */
  key: string;
  channel: SentChannel;
  id: string;
  /** Email address or phone number, as addressed. */
  to: string;
  /** The subject line, or the first of a text — one line, never the full body. */
  preview: string;
  createdAt: Date;
  status: string;
  templateKey: string | null;
  hasCalendar: boolean;
};

export function sentKey(channel: SentChannel, id: string): string {
  return `${channel}:${id}`;
}

/**
 * The inverse, over a value that arrived in a query string. Row ids are UUIDs and carry no colon,
 * so splitting at the first one is unambiguous; anything that does not name a known channel is
 * rejected rather than guessed at, because the channel decides which table the id is looked up in
 * and which redaction policy runs against the result.
 */
export function parseSentKey(raw: string | null | undefined): { channel: SentChannel; id: string } | null {
  if (!raw) return null;
  const separator = raw.indexOf(':');
  if (separator <= 0) return null;
  const channel = raw.slice(0, separator);
  const id = raw.slice(separator + 1);
  if (!id) return null;
  if (channel !== 'email' && channel !== 'sms') return null;
  return { channel, id };
}

export function mailToSent(entry: MailboxEntry): SentMessage {
  return {
    key: sentKey('email', entry.id),
    channel: 'email',
    id: entry.id,
    to: entry.toEmail,
    preview: entry.subject,
    createdAt: entry.createdAt,
    status: entry.status,
    templateKey: entry.templateKey,
    hasCalendar: Boolean(entry.icsBody),
  };
}

/**
 * `preview` is the caller's problem, not this function's: an SMS body can carry a live sign-in
 * token and the list has no per-recipient visibility check, so the redacted body has to be computed
 * by the page (which can await the policy) and handed in already safe.
 */
export function smsToSent(entry: SmsMailboxEntry, preview: string): SentMessage {
  return {
    key: sentKey('sms', entry.id),
    channel: 'sms',
    id: entry.id,
    to: entry.toPhone,
    preview,
    createdAt: entry.createdAt,
    status: entry.status,
    templateKey: entry.templateKey,
    hasCalendar: false,
  };
}

/**
 * Newest first across both channels.
 *
 * Taking `limit` from each channel and then trimming to `limit` really does yield the true newest
 * `limit` overall, and not an approximation of it: any message in the combined top `limit` is at
 * worst the `limit`-th newest within its own channel, so it cannot have been cut before it got
 * here. The tie-break on `key` only exists so two rows written in the same millisecond do not swap
 * places between renders.
 */
export function mergeSent(groups: SentMessage[][], limit: number): SentMessage[] {
  return groups
    .flat()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.key.localeCompare(b.key))
    .slice(0, limit);
}
