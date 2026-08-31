import { and, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import {
  carriesMagicLink as mailCarriesMagicLink,
  mailboxBody,
} from '@/app/organizer/mail/magic-links';
import {
  carriesMagicLink as smsCarriesMagicLink,
  smsMailboxBody,
} from '@/app/organizer/sms/magic-links';
import { getDb } from '@/db/client';
import { emailLog, membership, smsLog, user } from '@/db/schema';
import { currentActor, magicLinkMayBeShown, normalizeEmail } from '@/lib/auth';
import type { LinkVisibility } from '@/lib/demo-access';
import { isUuid } from '@/lib/identifiers';
import { activeTransportName } from '@/lib/mail';
import { REDACTED } from '@/lib/mail/redact';
import { emailForSmsRecipient } from '@/lib/services/comms';
import { activeSmsTransportName } from '@/lib/sms';

/**
 * The delivery simulator behind `components/comms/CommsSimulator`.
 *
 * Neither channel is wired to a provider right now — `MAIL_TRANSPORT` and `SMS_TRANSPORT` are both
 * on `log`, so `sendMail` and `sendSms` write their row and return, and the only trace of an
 * acceptance email is a row in `email_log` that somebody has to open `/organizer/sent` to find.
 * That makes the product feel inert: you approve a submission and nothing visibly happens.
 *
 * This module answers "what has been sent since I last looked that I am allowed to see", so the
 * client can raise each one as a toast at roughly the moment a real provider would have delivered
 * it. It is a demo aid, and it is built so that turning a real provider on turns it off rather than
 * leaving a second, divergent inbox running beside the real one.
 *
 * ## It never widens who can read a message
 *
 * Everything here is already readable by this viewer somewhere else; the simulator only changes
 * *when* they see it. Two independent limits keep it that way.
 *
 * **Scope.** A row is visible on exactly two grounds, and no others:
 *
 *  - *recipient* — it is addressed to the viewer's own account address, or to a phone number they
 *    have verified. Verification is load-bearing: `user.phone` is self-asserted until an OTP binds
 *    it, so matching an unverified number would let anyone read a stranger's SMS by typing that
 *    stranger's number into their own profile.
 *  - *organizer* — it went out for an event on which the viewer holds the `organizer` role.
 *    Reviewers and speakers hold memberships on that event too and are deliberately excluded; they
 *    see mail addressed to them and nothing else, which is the same line `/organizer/sent` draws by
 *    only offering events the viewer organizes.
 *
 * A signed-out visitor sees nothing at all. That covers the anonymous CFP submitter for free —
 * `submitPublicForm` mints them a session before the confirmation goes out (`P-3`), so by the time
 * the first poll lands they are a recipient in their own right.
 *
 * **Redaction.** A body can carry a `/auth/verify?token=…`, which is a live session as whoever it
 * was minted for. Every body here goes through the same `magicLinkMayBeShown` predicate, via the
 * same `mailboxBody` / `smsMailboxBody` helpers, that `/organizer/sent` goes through — asked per
 * message about *that message's* recipient.
 *
 * Be clear about what that is worth today: it withholds nothing. The simulator only runs on a
 * channel whose transport is `log`, and `magicLinkPrecheck` answers `instance-delivers-nothing` for
 * exactly that case, so every link is shown — which is the same answer the archive gives on the
 * same instance, and is `T-7a` working as intended. The gate is here so this surface has no policy
 * of its own to drift: if the conditions in `lib/demo-access.ts` ever change, or a future channel
 * is simulated while still delivering, this follows without being edited. The load-bearing limit on
 * this surface is the scope above, not this.
 */

export type SimulatedChannel = 'email' | 'sms';

/** Why this viewer is being shown this message. Rendered, because the two read very differently. */
export type SimulatedAudience = 'recipient' | 'organizer';

export type SimulatedMessage = {
  /** Stable across polls, so the client can drop a message it has already raised. */
  key: string;
  channel: SimulatedChannel;
  id: string;
  to: string;
  from: string;
  /** Email only; an SMS has no subject line. */
  subject: string | null;
  /** Email only. Already redacted, and injected by the client as the archive injects it. */
  bodyHtml: string | null;
  bodyText: string;
  links: string[];
  /**
   * A sign-in link this viewer is entitled to, if the message carries one. The client pins those
   * toasts instead of letting them time out — a magic link that scrolls off the stack unread is the
   * one failure here that costs somebody their way into the app.
   */
  signInLink: string | null;
  /** True when a credential was withheld, so the client can say so rather than show a dead link. */
  redacted: boolean;
  hasIcs: boolean;
  status: string;
  error: string | null;
  templateKey: string | null;
  createdAt: string;
  audience: SimulatedAudience;
};

export type SimulatedCursor = { email: string | null; sms: string | null };

export type SimulatedFeed = {
  /**
   * False when there is nothing to poll for — signed out, or every channel has a real provider. The
   * client backs off to a slow heartbeat rather than stopping outright, so signing in without a
   * full reload still starts the stream.
   */
  active: boolean;
  /** Per channel: is this one being simulated because it delivers nothing? */
  simulating: { email: boolean; sms: boolean };
  messages: SimulatedMessage[];
  cursor: SimulatedCursor;
};

/** How many messages one poll may carry per channel. The rest arrive on the next poll, in order. */
const PAGE = 10;

/**
 * The low end of a `(created_at, id)` cursor, for anchoring a first poll at a point in time rather
 * than at a row. No row can hold it — `gen_random_uuid()` never returns nil.
 */
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

function encodeCursor(createdAt: Date, id: string): string {
  return `${createdAt.toISOString()}|${id}`;
}

export function decodeCursor(raw: string | null | undefined): { createdAt: Date; id: string } | null {
  if (!raw) return null;
  const split = raw.indexOf('|');
  if (split < 0) return null;
  const createdAt = new Date(raw.slice(0, split));
  const id = raw.slice(split + 1);
  if (Number.isNaN(createdAt.getTime()) || !isUuid(id)) return null;
  return { createdAt, id };
}

/**
 * Which channels currently deliver nothing, and are therefore worth simulating. Reading the live
 * transport rather than a flag of its own is what makes this self-disabling: the day a
 * `RESEND_API_KEY` lands, email stops popping up here because email is now arriving for real, and
 * SMS carries on being simulated until Twilio is configured too.
 */
export function simulatedChannels(): { email: boolean; sms: boolean } {
  return {
    email: activeTransportName() === 'log',
    sms: activeSmsTransportName() === 'log',
  };
}

/** Events the viewer organizes. Reviewer and speaker memberships are not enough — see the header. */
async function organizedEventIds(userId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ eventId: membership.eventId })
    .from(membership)
    .where(and(eq(membership.userId, userId), eq(membership.role, 'organizer')));
  return [...new Set(rows.map((row) => row.eventId))];
}

/** The viewer's own SMS destination, or `null` while the number is still self-asserted. */
async function verifiedPhone(userId: string): Promise<string | null> {
  const row = await getDb().query.user.findFirst({ where: eq(user.id, userId) });
  return row?.phone && row.phoneVerifiedAt ? row.phone : null;
}

const VERIFY_LINK = /https?:\/\/[^\s"'<>]*\/auth\/verify[^\s"'<>]*/i;

/**
 * The sign-in link in a body, if it survived redaction. Read off the *rendered* body rather than
 * the stored one, so a withheld credential reports as absent instead of as a link to nowhere.
 */
function signInLinkIn(...sources: Array<string | null>): string | null {
  for (const source of sources) {
    const match = source?.match(VERIFY_LINK);
    if (!match) continue;
    const href = match[0].replace(/&amp;/g, '&');
    if (href.includes(`token=${REDACTED}`)) continue;
    return href;
  }
  return null;
}

/** The database's clock, which is what stamps `created_at`. The app's own would drift against it. */
async function databaseNow(): Promise<Date> {
  const result = await getDb().execute<{ now: Date }>(sql`select now() as now`);
  const value = result.rows[0]?.now;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

async function mailMessages(
  actorEmail: string,
  eventIds: string[],
  cursor: { createdAt: Date; id: string },
): Promise<SimulatedMessage[]> {
  const addressed = sql`lower(${emailLog.toEmail}) = ${actorEmail}`;
  const scope =
    eventIds.length > 0 ? or(addressed, inArray(emailLog.eventId, eventIds))! : addressed;

  const rows = await getDb()
    .select()
    .from(emailLog)
    .where(
      and(
        scope,
        // Row comparison, which orders on `created_at` and breaks ties on `id`. A plain
        // `created_at > :since` silently drops rows whenever a bulk send stamps a batch on one
        // instant and that batch is larger than a page.
        sql`(${emailLog.createdAt}, ${emailLog.id}) > (${cursor.createdAt.toISOString()}::timestamptz, ${cursor.id}::uuid)`,
      ),
    )
    .orderBy(emailLog.createdAt, emailLog.id)
    .limit(PAGE);

  return Promise.all(
    rows.map(async (row) => {
      // Only a body that actually carries a credential costs the visibility lookup, exactly as on
      // `/organizer/sent`. An ordinary acceptance email is free.
      const visibility = mailCarriesMagicLink(row) ? await magicLinkMayBeShown(row.toEmail) : null;
      const body = mailboxBody(row, visibility);
      return {
        key: `email:${row.id}`,
        channel: 'email' as const,
        id: row.id,
        to: row.toEmail,
        from: row.fromEmail,
        subject: row.subject,
        bodyHtml: body.bodyHtml,
        bodyText: body.bodyText,
        links: body.links,
        signInLink: signInLinkIn(body.bodyHtml, body.bodyText),
        redacted: body.redacted,
        hasIcs: Boolean(row.icsBody),
        status: row.status,
        error: row.error,
        templateKey: row.templateKey,
        createdAt: row.createdAt.toISOString(),
        audience:
          normalizeEmail(row.toEmail) === actorEmail
            ? ('recipient' as const)
            : ('organizer' as const),
      };
    }),
  );
}

async function smsMessages(
  phone: string | null,
  eventIds: string[],
  cursor: { createdAt: Date; id: string },
): Promise<SimulatedMessage[]> {
  const clauses: SQL[] = [];
  if (phone) clauses.push(sql`${smsLog.toPhone} = ${phone}`);
  if (eventIds.length > 0) clauses.push(inArray(smsLog.eventId, eventIds));
  if (clauses.length === 0) return [];
  const scope = clauses.length === 1 ? clauses[0] : or(...clauses)!;

  const rows = await getDb()
    .select()
    .from(smsLog)
    .where(
      and(
        scope,
        sql`(${smsLog.createdAt}, ${smsLog.id}) > (${cursor.createdAt.toISOString()}::timestamptz, ${cursor.id}::uuid)`,
      ),
    )
    .orderBy(smsLog.createdAt, smsLog.id)
    .limit(PAGE);

  const transport = activeSmsTransportName();

  return Promise.all(
    rows.map(async (row) => {
      // A token in an SMS is a session as the phone's owner. Resolve exactly one owner, then ask
      // the same policy the archive asks, over the channel that actually carried this message. A
      // missing or duplicated phone match fails closed inside `emailForSmsRecipient`.
      let visibility: LinkVisibility = null;
      if (smsCarriesMagicLink(row)) {
        const recipientEmail = await emailForSmsRecipient(row.toPhone);
        visibility = recipientEmail ? await magicLinkMayBeShown(recipientEmail, transport) : null;
      }
      const body = smsMailboxBody(row, visibility);
      return {
        key: `sms:${row.id}`,
        channel: 'sms' as const,
        id: row.id,
        to: row.toPhone,
        from: row.fromPhone,
        subject: null,
        bodyHtml: null,
        bodyText: body.body,
        links: [],
        signInLink: signInLinkIn(body.body),
        redacted: body.redacted,
        hasIcs: false,
        status: row.status,
        error: row.error,
        templateKey: row.templateKey,
        createdAt: row.createdAt.toISOString(),
        audience: phone && row.toPhone === phone ? ('recipient' as const) : ('organizer' as const),
      };
    }),
  );
}

function lastCursor(rows: SimulatedMessage[]): string | null {
  const tail = rows[rows.length - 1];
  return tail ? encodeCursor(new Date(tail.createdAt), tail.id) : null;
}

/**
 * One poll.
 *
 * A poll with no cursor returns **no messages** — only a cursor anchored at the current database
 * time. Opening the app is not an event that should replay the archive, and on the seeded demo the
 * archive is six hundred senators: the first thing a judge would see is six hundred toasts for mail
 * sent before they arrived. The stream starts from the moment the page loaded.
 */
export async function simulatedFeed(since: SimulatedCursor): Promise<SimulatedFeed> {
  const simulating = simulatedChannels();
  const actor = await currentActor();

  if (!actor || (!simulating.email && !simulating.sms)) {
    return { active: false, simulating, messages: [], cursor: { email: null, sms: null } };
  }

  const actorEmail = normalizeEmail(actor.email);
  const mailCursor = simulating.email ? decodeCursor(since.email) : null;
  const smsCursor = simulating.sms ? decodeCursor(since.sms) : null;

  // Anchoring both channels on one `now()` keeps a first poll from straddling two instants.
  const needsAnchor = (simulating.email && !mailCursor) || (simulating.sms && !smsCursor);
  const anchored = needsAnchor ? encodeCursor(await databaseNow(), NIL_UUID) : null;

  const [eventIds, phone] = await Promise.all([
    organizedEventIds(actor.userId),
    simulating.sms ? verifiedPhone(actor.userId) : Promise.resolve(null),
  ]);

  const [mail, sms] = await Promise.all([
    mailCursor ? mailMessages(actorEmail, eventIds, mailCursor) : Promise.resolve([]),
    smsCursor ? smsMessages(phone, eventIds, smsCursor) : Promise.resolve([]),
  ]);

  return {
    active: true,
    simulating,
    // Interleaved, so a notification that went out on both channels arrives in the order it was sent.
    messages: [...mail, ...sms].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    cursor: {
      email: simulating.email ? (lastCursor(mail) ?? since.email ?? anchored) : null,
      sms: simulating.sms ? (lastCursor(sms) ?? since.sms ?? anchored) : null,
    },
  };
}
