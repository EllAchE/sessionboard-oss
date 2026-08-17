import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import type { Actor, EventContext, MembershipRole } from '@/lib/context';
import { getDb } from './client';
import {
  event,
  form,
  membership,
  participant,
  reviewAssignment,
  reviewRound,
  room,
  scheduledSession,
  scorecardCriterion,
  sessionFormat,
  sponsor,
  submission,
  track,
  user,
} from './schema';

/**
 * Fixtures for the database-backed suite.
 *
 * Every fixture builds its own event and its own users, so tests never share rows and never need a
 * truncate between them. That costs a handful of inserts and buys the thing that matters more:
 * files can be added later without anyone having to reason about ordering.
 *
 * Only reachable from `*.integration.test.ts`, which the default vitest config excludes.
 */

export type ReviewFixture = {
  eventId: string;
  roundId: string;
  submissionId: string;
  otherSubmissionId: string;
  /** The reviewer under test, assigned to `submissionId` only. */
  reviewer: Actor;
  /** A second reviewer on the same submission, for the peer-visibility rules. */
  peer: Actor;
  /** The author, so authorship-hiding has something real to hide. */
  author: Actor;
  organizer: Actor;
  assignmentId: string;
  peerAssignmentId: string;
  criteria: Array<{ id: string; label: string; weight: number; maxScore: number }>;
  ctx: (actor: Actor, ...roles: MembershipRole[]) => EventContext;
};

/**
 * `displayName` matters for the author: `loadAssignedReview` reads `submitterName` off the *user*
 * row, so an author named "author" would make every anonymity assertion pass whether the service
 * redacted anything or not.
 */
async function makeUser(slug: string, displayName = slug): Promise<Actor> {
  const [row] = await getDb()
    .insert(user)
    .values({ email: `${slug}-${randomUUID()}@forum.test`, name: displayName })
    .returning();
  return { userId: row.id, email: row.email, name: row.name, impersonatedByUserId: null };
}

export type ReviewFixtureOptions = {
  roundStatus?: 'draft' | 'open' | 'closed';
  blindUntilClose?: boolean;
  anonymized?: boolean;
};

/**
 * One event containing: an organizer, two reviewers, an author, two submitted talks, an open round
 * with three weighted criteria, and assignments putting both reviewers on the first talk only —
 * which is what makes "not assigned to you" testable at all.
 */
export async function seedReviewFixture(
  options: ReviewFixtureOptions = {},
): Promise<ReviewFixture> {
  const db = getDb();

  const [organizer, reviewer, peer, author] = await Promise.all([
    makeUser('organizer', 'Cato the Elder'),
    makeUser('reviewer', 'Marcus Tullius Cicero'),
    makeUser('peer', 'Brutus'),
    makeUser('author', 'Vitruvius Pollio'),
  ]);

  const [eventRow] = await db
    .insert(event)
    .values({
      slug: `forum-${randomUUID()}`,
      name: 'The Forum',
      timezone: 'UTC',
      // `E-1`: the instants are required, and `startsOn`/`endsOn` are their date-only projection
      // into `timezone` — normally derived on write, set explicitly here.
      startsAt: new Date('2026-09-10T09:00:00.000Z'),
      endsAt: new Date('2026-09-12T17:00:00.000Z'),
      startsOn: '2026-09-10',
      endsOn: '2026-09-12',
      ownerUserId: organizer.userId,
    })
    .returning();

  await db.insert(membership).values([
    { userId: organizer.userId, eventId: eventRow.id, role: 'organizer' },
    { userId: reviewer.userId, eventId: eventRow.id, role: 'reviewer' },
    { userId: peer.userId, eventId: eventRow.id, role: 'reviewer' },
    { userId: author.userId, eventId: eventRow.id, role: 'speaker' },
  ]);

  // The queue reads the author's display name off the participant row, so a bare user is not
  // enough for the authorship-hiding assertions to mean anything.
  await db.insert(participant).values({
    eventId: eventRow.id,
    userId: author.userId,
    displayName: 'Vitruvius Pollio',
    company: 'The Aqueduct Office',
  });

  const [formRow] = await db
    .insert(form)
    .values({ eventId: eventRow.id, kind: 'cfp', name: 'Call for orators', slug: 'speak' })
    .returning();

  const [mine, other] = await db
    .insert(submission)
    .values([
      {
        eventId: eventRow.id,
        formId: formRow.id,
        ref: 1,
        submitterUserId: author.userId,
        title: 'On the nature of aqueducts',
        descriptionMarkdown: 'Water, and how it is persuaded to climb.',
        status: 'submitted',
        submittedAt: new Date(),
      },
      {
        eventId: eventRow.id,
        formId: formRow.id,
        ref: 2,
        submitterUserId: author.userId,
        title: 'On the arch',
        status: 'submitted',
        submittedAt: new Date(),
      },
    ])
    .returning();

  const [roundRow] = await db
    .insert(reviewRound)
    .values({
      eventId: eventRow.id,
      name: 'First hearing',
      status: options.roundStatus ?? 'open',
      blindUntilClose: options.blindUntilClose ?? true,
      anonymized: options.anonymized ?? false,
    })
    .returning();

  const criteria = await db
    .insert(scorecardCriterion)
    .values([
      { reviewRoundId: roundRow.id, label: 'Relevance', weight: 2, maxScore: 5, position: 0 },
      { reviewRoundId: roundRow.id, label: 'Originality', weight: 1, maxScore: 5, position: 1 },
      { reviewRoundId: roundRow.id, label: 'Readiness', weight: 1, maxScore: 5, position: 2 },
    ])
    .returning();

  const assignments = await db
    .insert(reviewAssignment)
    .values([
      { reviewRoundId: roundRow.id, submissionId: mine.id, reviewerUserId: reviewer.userId },
      { reviewRoundId: roundRow.id, submissionId: mine.id, reviewerUserId: peer.userId },
    ])
    .returning();

  return {
    eventId: eventRow.id,
    roundId: roundRow.id,
    submissionId: mine.id,
    otherSubmissionId: other.id,
    reviewer,
    peer,
    author,
    organizer,
    assignmentId: assignments[0].id,
    peerAssignmentId: assignments[1].id,
    criteria: criteria.map((row) => ({
      id: row.id,
      label: row.label,
      weight: row.weight,
      maxScore: row.maxScore,
    })),
    ctx: (actor, ...roles) => ({ actor, eventId: eventRow.id, roles }),
  };
}

export type ContentFixture = {
  eventId: string;
  organizer: Actor;
  /** Two rooms and two of everything else, so a move has somewhere to move *to*. */
  rooms: Array<{ id: string; name: string }>;
  tracks: Array<{ id: string; name: string }>;
  formats: Array<{ id: string; name: string }>;
  sessionId: string;
  sponsorId: string;
  ctx: (actor?: Actor, ...roles: MembershipRole[]) => EventContext;
};

/**
 * `AD-4`. One event holding the two entity kinds that gained a history — a scheduled session on the
 * grid and a sponsor on the board — plus the taxonomy rows the session points at, because the
 * revision diff resolves those uuids to names and a fixture without them would only ever exercise
 * the fallback.
 */
export async function seedContentFixture(): Promise<ContentFixture> {
  const db = getDb();
  const organizer = await makeUser('organizer', 'Cato the Elder');

  const [eventRow] = await db
    .insert(event)
    .values({
      slug: `curia-${randomUUID()}`,
      name: 'The Curia',
      timezone: 'UTC',
      startsAt: new Date('2026-09-10T09:00:00.000Z'),
      endsAt: new Date('2026-09-12T17:00:00.000Z'),
      startsOn: '2026-09-10',
      endsOn: '2026-09-12',
      ownerUserId: organizer.userId,
    })
    .returning();

  await db
    .insert(membership)
    .values({ userId: organizer.userId, eventId: eventRow.id, role: 'organizer' });

  const [rooms, tracks, formats] = await Promise.all([
    db
      .insert(room)
      .values([
        { eventId: eventRow.id, name: 'Basilica Julia', position: 0 },
        { eventId: eventRow.id, name: 'Rostra', position: 1 },
      ])
      .returning({ id: room.id, name: room.name }),
    db
      .insert(track)
      .values([
        { eventId: eventRow.id, name: 'Rhetoric', position: 0 },
        { eventId: eventRow.id, name: 'Law', position: 1 },
      ])
      .returning({ id: track.id, name: track.name }),
    db
      .insert(sessionFormat)
      .values([
        { eventId: eventRow.id, name: 'Oration', durationMinutes: 45, position: 0 },
        { eventId: eventRow.id, name: 'Debate', durationMinutes: 90, position: 1 },
      ])
      .returning({ id: sessionFormat.id, name: sessionFormat.name }),
  ]);

  const [sessionRow] = await db
    .insert(scheduledSession)
    .values({
      eventId: eventRow.id,
      ref: 1,
      title: 'On duties',
      descriptionMarkdown: 'What is owed, and to whom.',
      roomId: rooms[0].id,
      trackId: tracks[0].id,
      formatId: formats[0].id,
      startsAt: new Date('2026-09-10T10:00:00.000Z'),
      endsAt: new Date('2026-09-10T10:45:00.000Z'),
      status: 'draft',
      icsUid: `${randomUUID()}@cicero.test`,
    })
    .returning();

  const [sponsorRow] = await db
    .insert(sponsor)
    .values({
      eventId: eventRow.id,
      name: 'Atticus & Co',
      kind: 'sponsor',
      status: 'draft',
      tier: 'Gold',
      websiteUrl: 'https://atticus.test',
    })
    .returning();

  return {
    eventId: eventRow.id,
    organizer,
    rooms,
    tracks,
    formats,
    sessionId: sessionRow.id,
    sponsorId: sponsorRow.id,
    ctx: (actor = organizer, ...roles) => ({
      actor,
      eventId: eventRow.id,
      roles: roles.length > 0 ? roles : ['organizer'],
    }),
  };
}

export async function dropContentFixture(fixture: ContentFixture): Promise<void> {
  const db = getDb();
  await db.delete(event).where(eq(event.id, fixture.eventId));
  await db.delete(user).where(eq(user.id, fixture.organizer.userId));
}

/** Removes one fixture's event; the cascades take everything hanging off it. */
export async function dropReviewFixture(fixture: ReviewFixture): Promise<void> {
  const db = getDb();
  await db.delete(event).where(eq(event.id, fixture.eventId));
  await db.delete(user).where(
    inArray(user.id, [
      fixture.organizer.userId,
      fixture.reviewer.userId,
      fixture.peer.userId,
      fixture.author.userId,
    ]),
  );
}
