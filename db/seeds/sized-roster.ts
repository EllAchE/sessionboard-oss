import { eq } from 'drizzle-orm';
import { newIcsUid } from '../../lib/ics';
import { splitPersonName } from '../../lib/person-name';
import type { Database } from '../client';
import {
  event,
  participant,
  participantRole,
  reviewAssignment,
  scheduledSession,
  score,
  submission,
  user,
} from '../schema';
import type { EventSize } from './event-sizes';
import { generatedEmailDomain } from './event-sizes';
import { generateProposals, generateSpeakers } from './generated-roster';
import { seedProfileArt } from './profile-art-store';

/**
 * Fills a sample event out to its size.
 *
 * The hand-authored core of an event — Vitruvius, Cornelia, the fourteen proposals somebody
 * actually wrote — is what makes the demo readable. This is what makes it *load-bearing*: the rest
 * of the roster, the rest of the call, the rest of the grid. It is additive by design, so the
 * narrative fixtures above it keep their refs, their reviews and their agenda placements exactly as
 * they were, and a reader who only ever looks at the first screen sees no difference.
 *
 * Used by `db/seed.ts` to bring `demo` up to medium, and by `db/seeds/sized-demo.ts` to build the
 * small and large siblings from an otherwise bare event.
 *
 * ## Why the generated sessions get their own rooms
 *
 * Placing them anywhere in the grid would mean checking each candidate slot against the
 * hand-authored placements, which have deliberately awkward starts and a ninety-minute workshop.
 * Reserving the first `reservedRooms` rooms for the hand-written agenda makes overlap impossible by
 * construction instead of by a predicate that has to stay correct as the fixtures are edited — and
 * an organizer looking at the board still sees one continuous programme.
 */

/** 30-minute slots across a conference day, with an hour out for lunch. */
const SLOT_MINUTES = 30;
const SLOTS_PER_DAY = [
  9 * 60, 9 * 60 + 30, 10 * 60, 10 * 60 + 30, 11 * 60, 11 * 60 + 30,
  13 * 60, 13 * 60 + 30, 14 * 60, 14 * 60 + 30, 15 * 60, 15 * 60 + 30,
  16 * 60, 16 * 60 + 30,
];

export type SizedRosterResult = {
  speakers: number;
  submissions: number;
  scheduledSessions: number;
};

export type SizedRosterParams = {
  eventId: string;
  size: EventSize;
  organizerUserId: string;
  formId: string;
  timezone: string;
  tracks: readonly { id: string }[];
  formats: readonly { id: string; durationMinutes: number; name: string }[];
  rooms: readonly { id: string }[];
  personas: readonly { id: string }[];
  /**
   * One instant per conference day: local midnight, expressed in UTC. Slot times below are added
   * as wall-clock minutes, so passing a bare UTC midnight for an event that is not on UTC would
   * schedule the whole programme at the wrong hour.
   */
  days: readonly Date[];
  now: Date;
  /** Speakers, proposals and sessions the hand-authored fixtures already created. */
  existing: { speakers: number; submissions: number; sessions: number };
  /** Rooms the hand-authored agenda already occupies. Generated sessions never touch them. */
  reservedRooms: number;
  /** Optional: put the generated queue in front of reviewers so the review screen has volume. */
  review?: {
    roundId: string;
    reviewerUserIds: readonly string[];
    criteria: readonly { id: string; maxScore: number }[];
  };
};

/** Deterministic spread, so the sorted review queue means something. Mirrors `seed.ts`. */
function scoreFor(seed: number, max: number): number {
  return ((seed * 7919) % max) + 1;
}

export async function seedSizedRoster(
  db: Database,
  params: SizedRosterParams,
): Promise<SizedRosterResult> {
  const { size, existing } = params;
  const speakerCount = size.speakers - existing.speakers;
  const proposalCount = size.submissions - existing.submissions;

  if (speakerCount <= 0 || proposalCount <= 0) {
    throw new Error(
      `Size "${size.key}" is smaller than the fixtures already on ${size.slug}: ` +
        `${size.speakers} speakers / ${size.submissions} proposals requested, ` +
        `${existing.speakers} / ${existing.submissions} already seeded.`,
    );
  }

  const openRooms = params.rooms.slice(params.reservedRooms);
  const capacity = openRooms.length * params.days.length * SLOTS_PER_DAY.length;
  if (capacity < speakerCount) {
    throw new Error(
      `Size "${size.key}" cannot be scheduled: ${speakerCount} accepted talks need more than the ` +
        `${capacity} slots in ${openRooms.length} rooms over ${params.days.length} days.`,
    );
  }

  const speakers = generateSpeakers(speakerCount, {
    domain: generatedEmailDomain(size),
    startIndex: existing.speakers,
  });

  // One accepted proposal per generated speaker, so every one of them has a talk on the grid and
  // the public roster length is exactly what the size profile promises.
  const proposals = generateProposals(speakers, {
    count: proposalCount,
    acceptedCount: speakerCount,
    titleOffset: existing.submissions,
  });

  const speakerUsers = await db
    .insert(user)
    .values(
      speakers.map((speaker) => ({
        email: speaker.email,
        name: speaker.name,
        ...splitPersonName(speaker.name),
      })),
    )
    .returning();
  const userByEmail = new Map(speakerUsers.map((row) => [row.email, row]));

  const profileArt = await seedProfileArt(db, {
    eventId: params.eventId,
    uploadedByUserId: params.organizerUserId,
    speakerKeys: speakers.map((speaker) => speaker.email),
    slotOffset: size.headshotSlotOffset + existing.speakers,
    gender: (email) => speakers.find((speaker) => speaker.email === email)?.gender,
  });

  const generatedParticipants = await db
    .insert(participant)
    .values(
      speakers.map((speaker) => ({
        eventId: params.eventId,
        userId: userByEmail.get(speaker.email)!.id,
        displayName: speaker.name,
        pronouns: speaker.pronouns ?? null,
        jobTitle: speaker.title,
        company: speaker.organization,
        bioMarkdown: speaker.bio,
        // Same reason as the hand-authored roster: the schema default is `invited`, which the
        // public read model excludes, and a gallery of invited speakers renders empty.
        headshotFileId: profileArt.get(speaker.email)!,
        timezone: params.timezone,
        workflowStatus: 'confirmed' as const,
        links: [{ label: 'Website', url: 'https://example.com' }],
      })),
    )
    .returning();
  const participantByUser = new Map(generatedParticipants.map((row) => [row.userId, row]));

  const ago = (days: number) => new Date(params.now.getTime() - days * 86_400_000);
  const talkFormat = params.formats.find((format) => format.name === 'Talk') ?? params.formats[0]!;

  const generatedSubmissions = await db
    .insert(submission)
    .values(
      proposals.map((proposal, index) => ({
        eventId: params.eventId,
        formId: params.formId,
        ref: existing.submissions + index + 1,
        submitterUserId: userByEmail.get(proposal.email)!.id,
        title: proposal.title,
        descriptionMarkdown: proposal.abstract,
        // Accepted talks all run 30 minutes so they tile the grid without overlapping.
        formatId:
          proposal.status === 'accepted'
            ? talkFormat.id
            : params.formats[proposal.formatIndex % params.formats.length]!.id,
        trackId: params.tracks[proposal.trackIndex % params.tracks.length]!.id,
        level: proposal.level,
        personaId: params.personas[index % params.personas.length]!.id,
        status: proposal.status,
        answers: { takeaways: proposal.takeaways, given_before: false },
        submittedAt: ago(proposal.daysAgo),
        decidedAt: ['accepted', 'declined', 'waitlisted'].includes(proposal.status) ? ago(4) : null,
        decisionNote:
          proposal.status === 'declined'
            ? 'A good proposal that lost to a stronger one in the same track.'
            : null,
        createdAt: ago(proposal.daysAgo),
      })),
    )
    .returning();

  await db.insert(participantRole).values(
    generatedSubmissions.map((row) => ({
      submissionId: row.id,
      participantId: participantByUser.get(row.submitterUserId)!.id,
      kind: 'speaker' as const,
      isPrimary: true,
    })),
  );

  // ---------------------------------------------------------------------------
  // Agenda
  // ---------------------------------------------------------------------------

  const acceptedGenerated = generatedSubmissions.filter((row) => row.status === 'accepted');
  const scheduled = await db
    .insert(scheduledSession)
    .values(
      acceptedGenerated.map((row, index) => {
        // Walk rooms fastest, then slots, then days: the first day fills before the second, and
        // each slot reads as a parallel track rather than as one room used back to back.
        const roomIndex = index % openRooms.length;
        const slotIndex = Math.floor(index / openRooms.length) % SLOTS_PER_DAY.length;
        const dayIndex = Math.floor(index / (openRooms.length * SLOTS_PER_DAY.length));
        const start = new Date(
          params.days[dayIndex]!.getTime() + SLOTS_PER_DAY[slotIndex]! * 60_000,
        );

        return {
          eventId: params.eventId,
          submissionId: row.id,
          ref: existing.sessions + index + 1,
          title: row.title,
          descriptionMarkdown: row.descriptionMarkdown,
          roomId: openRooms[roomIndex]!.id,
          trackId: row.trackId,
          formatId: row.formatId,
          startsAt: start,
          endsAt: new Date(start.getTime() + SLOT_MINUTES * 60_000),
          status: 'published' as const,
          icsUid: newIcsUid(),
        };
      }),
    )
    .returning();

  // ---------------------------------------------------------------------------
  // Reviews. A queue of a hundred untouched proposals reads as a broken screen rather than a busy
  // one, so everything that reached a reviewer carries assignments and scores.
  // ---------------------------------------------------------------------------

  if (params.review && params.review.reviewerUserIds.length > 0) {
    const { roundId, reviewerUserIds, criteria } = params.review;
    const reviewable = generatedSubmissions.filter((row) => row.status !== 'submitted');

    const assignments = await db
      .insert(reviewAssignment)
      .values(
        reviewable.flatMap((row, index) =>
          // Two reviewers each, walked round-robin so the load spreads evenly over the panel.
          [0, 1].map((offset) => ({
            reviewRoundId: roundId,
            submissionId: row.id,
            reviewerUserId: reviewerUserIds[(index * 2 + offset) % reviewerUserIds.length]!,
            status: 'completed' as const,
            comment:
              'Well scoped, and the evidence is checkable. Would want the demonstration tightened.',
            completedAt: ago(6),
          })),
        ),
      )
      .returning();

    if (assignments.length > 0 && criteria.length > 0) {
      await db.insert(score).values(
        assignments.flatMap((assignment, index) =>
          criteria.map((criterion, position) => ({
            reviewAssignmentId: assignment.id,
            criterionId: criterion.id,
            value: scoreFor(index + position * 3 + 1, criterion.maxScore),
          })),
        ),
      );
    }
  }

  await db
    .update(event)
    .set({
      submissionSeq: existing.submissions + generatedSubmissions.length,
      sessionSeq: existing.sessions + scheduled.length,
    })
    .where(eq(event.id, params.eventId));

  return {
    speakers: speakers.length,
    submissions: generatedSubmissions.length,
    scheduledSessions: scheduled.length,
  };
}
