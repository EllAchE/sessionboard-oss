import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/db/client';
import { emailLog, event, membership, smsLog, user } from '@/db/schema';
import type { Actor } from '@/lib/context';

/**
 * The simulator's scope rule, against real rows and real SQL.
 *
 * This surface is the first thing in the app that reads `email_log` and `sms_log` for somebody who
 * is not looking at `/organizer/sent`, so "who may see which row" is new access control rather than
 * a rearrangement of an existing screen. A mocked query builder would assert that against a stub
 * that answers whatever the test wants; the `or(...)` and the row-comparison cursor are precisely
 * the parts worth executing.
 *
 * Requires DATABASE_URL and a migrated database: `bun run test:integration`.
 */

const state = { actor: null as Actor | null };

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, currentActor: async () => state.actor };
});

const { simulatedFeed } = await import('./comms-simulator');
type SimulatedCursor = import('./comms-simulator').SimulatedCursor;

type Fixture = {
  organizer: Actor;
  reviewer: Actor;
  speaker: Actor;
  unverified: Actor;
  mineId: string;
  otherId: string;
};

const created = { users: [] as string[], events: [] as string[] };

const VERIFIED_PHONE = '+15550100811';
const UNVERIFIED_PHONE = '+15550100822';

/** A cursor that predates every fixture row, so a poll returns the whole fixture. */
const FROM_THE_START = '2000-01-01T00:00:00.000Z|00000000-0000-0000-0000-000000000000';

function actorFor(row: { id: string; email: string; name: string | null }): Actor {
  return { userId: row.id, email: row.email, name: row.name, impersonatedByUserId: null };
}

async function seed(): Promise<Fixture> {
  const db = getDb();

  const [organizer, reviewer, speaker, unverified] = await db
    .insert(user)
    .values([
      { email: `cicero-${randomUUID()}@forum.test`, name: 'Marcus Tullius' },
      { email: `cato-${randomUUID()}@forum.test`, name: 'Cato' },
      {
        email: `ada-${randomUUID()}@forum.test`,
        name: 'Ada',
        phone: VERIFIED_PHONE,
        phoneVerifiedAt: new Date(),
      },
      // Same shape, but the number was never bound by an OTP.
      { email: `mallory-${randomUUID()}@forum.test`, name: 'Mallory', phone: UNVERIFIED_PHONE },
    ])
    .returning();
  created.users.push(organizer.id, reviewer.id, speaker.id, unverified.id);

  const makeEvent = (name: string) => ({
    slug: `${name.toLowerCase().replace(/\W+/g, '-')}-${randomUUID()}`,
    name,
    timezone: 'UTC',
    startsAt: new Date('2027-05-10T09:00:00.000Z'),
    endsAt: new Date('2027-05-12T17:00:00.000Z'),
    startsOn: '2027-05-10',
    endsOn: '2027-05-12',
    ownerUserId: organizer.id,
  });

  const [mine, other] = await db
    .insert(event)
    .values([makeEvent('The Forum'), makeEvent('The Circus')])
    .returning();
  created.events.push(mine.id, other.id);

  await db.insert(membership).values([
    { userId: organizer.id, eventId: mine.id, role: 'organizer' as const },
    // A reviewer and a speaker on the same event. Neither may read the event's outgoing mail.
    { userId: reviewer.id, eventId: mine.id, role: 'reviewer' as const },
    { userId: speaker.id, eventId: mine.id, role: 'speaker' as const },
    { userId: unverified.id, eventId: mine.id, role: 'speaker' as const },
    // The organizer of one event is a nobody on the next one.
    { userId: reviewer.id, eventId: other.id, role: 'organizer' as const },
  ]);

  await db.insert(emailLog).values([
    {
      eventId: mine.id,
      toEmail: speaker.email,
      fromEmail: 'forum@example.com',
      subject: 'Your session was accepted',
      bodyHtml: '<p>Congratulations.</p>',
      bodyText: 'Congratulations.',
      templateKey: 'submission.accepted',
      status: 'sent' as const,
    },
    {
      eventId: other.id,
      toEmail: `charioteer-${randomUUID()}@circus.test`,
      fromEmail: 'circus@example.com',
      subject: 'Race day briefing',
      bodyHtml: '<p>Bring a chariot.</p>',
      bodyText: 'Bring a chariot.',
      status: 'sent' as const,
    },
    // Addressed to the reviewer personally, on an event they only review.
    {
      eventId: mine.id,
      toEmail: reviewer.email,
      fromEmail: 'forum@example.com',
      subject: 'You have 4 abstracts to score',
      bodyHtml: '<p>Please score them.</p>',
      bodyText: 'Please score them.',
      status: 'sent' as const,
    },
  ]);

  await db.insert(smsLog).values([
    {
      eventId: mine.id,
      toPhone: VERIFIED_PHONE,
      fromPhone: '+15550100000',
      body: 'Your session starts in an hour.',
      status: 'sent' as const,
    },
    {
      eventId: other.id,
      toPhone: UNVERIFIED_PHONE,
      fromPhone: '+15550100000',
      body: 'Chariot inspection at noon.',
      status: 'sent' as const,
    },
  ]);

  return {
    organizer: actorFor(organizer),
    reviewer: actorFor(reviewer),
    speaker: actorFor(speaker),
    unverified: actorFor(unverified),
    mineId: mine.id,
    otherId: other.id,
  };
}

let fixture: Fixture;

beforeAll(async () => {
  process.env.MAIL_TRANSPORT = 'log';
  process.env.SMS_TRANSPORT = 'log';
  fixture = await seed();
});

afterAll(async () => {
  const db = getDb();
  // `email_log` and `sms_log` cascade from `event`; `membership` cascades from both.
  if (created.events.length > 0) await db.delete(event).where(inArray(event.id, created.events));
  if (created.users.length > 0) await db.delete(user).where(inArray(user.id, created.users));
});

/** Every message a given actor can see from the beginning of time. */
async function feedFor(actor: Actor | null) {
  state.actor = actor;
  return simulatedFeed({ email: FROM_THE_START, sms: FROM_THE_START });
}

describe('simulatedFeed scope', () => {
  it('shows a signed-out visitor nothing, and tells the client not to keep asking', async () => {
    const feed = await feedFor(null);
    expect(feed.active).toBe(false);
    expect(feed.messages).toEqual([]);
  });

  it('shows an organizer their own event and not the one next door', async () => {
    const feed = await feedFor(fixture.organizer);
    const subjects = feed.messages.map((message) => message.subject);

    expect(subjects).toContain('Your session was accepted');
    expect(subjects).toContain('You have 4 abstracts to score');
    expect(subjects).not.toContain('Race day briefing');
  });

  it('labels a message addressed to the viewer as theirs and the rest as the event’s', async () => {
    const feed = await feedFor(fixture.organizer);
    const accepted = feed.messages.find((m) => m.subject === 'Your session was accepted');
    expect(accepted?.audience).toBe('organizer');

    const own = await feedFor(fixture.speaker);
    expect(own.messages.find((m) => m.subject === 'Your session was accepted')?.audience).toBe(
      'recipient',
    );
  });

  it('gives a reviewer only what is addressed to them, never the event they review', async () => {
    const feed = await feedFor(fixture.reviewer);
    const subjects = feed.messages.map((message) => message.subject);

    expect(subjects).toContain('You have 4 abstracts to score');
    expect(subjects).not.toContain('Your session was accepted');
    // They organize the other event, so that one is theirs to read.
    expect(subjects).toContain('Race day briefing');
  });

  it('gives a speaker only what is addressed to them', async () => {
    const feed = await feedFor(fixture.speaker);
    const subjects = feed.messages
      .filter((message) => message.channel === 'email')
      .map((message) => message.subject);

    expect(subjects).toEqual(['Your session was accepted']);
  });

  it('delivers an SMS to the owner of a verified number', async () => {
    const feed = await feedFor(fixture.speaker);
    const sms = feed.messages.filter((message) => message.channel === 'sms');

    expect(sms.map((message) => message.bodyText)).toEqual(['Your session starts in an hour.']);
    expect(sms[0].audience).toBe('recipient');
  });

  it('withholds an SMS from an account whose number is still self-asserted', async () => {
    const feed = await feedFor(fixture.unverified);
    expect(feed.messages.filter((message) => message.channel === 'sms')).toEqual([]);
  });
});

describe('simulatedFeed cursor', () => {
  it('replays no backlog on a first poll, and starts the stream from there', async () => {
    state.actor = fixture.organizer;
    const first = await simulatedFeed({ email: null, sms: null });

    expect(first.active).toBe(true);
    expect(first.messages).toEqual([]);
    expect(first.cursor.email).toBeTruthy();
    expect(first.cursor.sms).toBeTruthy();

    // Nothing has been sent since, so polling again with that cursor is still quiet.
    const second = await simulatedFeed(first.cursor);
    expect(second.messages).toEqual([]);
  });

  it('walks a same-instant batch larger than one page without losing a row', async () => {
    const db = getDb();
    const stamp = new Date('2027-01-01T00:00:00.000Z');
    const bodies = Array.from({ length: 25 }, (_, index) => `Reminder ${index + 1}`);

    await db.insert(emailLog).values(
      bodies.map((body) => ({
        eventId: fixture.mineId,
        toEmail: `batch-${randomUUID()}@forum.test`,
        fromEmail: 'forum@example.com',
        subject: body,
        bodyHtml: `<p>${body}</p>`,
        bodyText: body,
        // One instant for the whole batch, which is what a bulk send actually produces and what a
        // plain `created_at > :since` cursor would silently truncate to a single page.
        createdAt: stamp,
        status: 'sent' as const,
      })),
    );

    state.actor = fixture.organizer;
    // Starts after every row seeded above and before the batch, so only the batch is in play.
    let cursor: SimulatedCursor = {
      email: '2026-12-31T00:00:00.000Z|00000000-0000-0000-0000-000000000000',
      sms: null,
    };
    const seen: string[] = [];
    let polls = 0;

    // Deliberately more polls than pages: the last one must come back empty, which is how we know
    // the walk ended because the batch ran out and not because the loop did.
    while (polls < 6) {
      polls += 1;
      const feed = await simulatedFeed(cursor);
      if (feed.messages.length === 0) break;
      for (const message of feed.messages) {
        if (message.subject?.startsWith('Reminder ')) seen.push(message.subject);
      }
      cursor = { email: feed.cursor.email, sms: null };
    }

    expect(polls).toBeLessThan(6);
    expect(seen.length).toBe(bodies.length);
    expect(new Set(seen).size).toBe(bodies.length);
  });
});
