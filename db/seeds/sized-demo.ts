import { requireEventWindow } from '../../lib/event-dates';
import { splitPersonName } from '../../lib/person-name';
import { seedBuiltinFields, seedRoles } from '../../lib/services/forms';
import type { Database } from '../client';
import {
  event,
  form,
  formField,
  formParticipantRole,
  membership,
  persona,
  reviewRound,
  room,
  scorecardCriterion,
  sessionFormat,
  track,
  user,
} from '../schema';
import type { EventSize } from './event-sizes';
import { generatedEmailDomain } from './event-sizes';
import { generatedSpeakerAt } from './generated-roster';
import { seedSizedRoster } from './sized-roster';

/**
 * The small and large sample events.
 *
 * `demo` is the one with the hand-authored narrative, and it stays the default. These two exist so
 * that "does this screen still work at four hundred proposals" is a question you can answer by
 * opening a URL rather than by writing a load fixture — and so that the honest answer to "how does
 * it feel for a twenty-person meetup" is also one click away. Same conference, three scales.
 *
 * ## Why the form is not written out by hand
 *
 * Both existing seeds spell their CFP fields inline, which is how one of them came to be missing a
 * built-in and hard-failed the first time an organizer pressed Publish — see the note on
 * `db/seed-form-invariants.test.ts`. This one calls `seedBuiltinFields` and `seedRoles`, the same
 * helpers `createForm` uses, so the invariant holds by construction instead of by a regex watching
 * the source. A third hand-written copy of that list is exactly the drift those tests exist to
 * catch.
 */

const DAY = 86_400_000;

const TRACK_NAMES = [
  { name: 'Infrastructure', color: 'lapis' },
  { name: 'Governance', color: 'vermilion' },
  { name: 'Knowledge & Communication', color: 'verdigris' },
  { name: 'Logistics & Operations', color: 'ochre' },
] as const;

const ROOM_NAMES = [
  'Forum Hall', 'Basilica Gallery', 'East Garden Room', 'Atrium Studio', 'Curia Annexe',
  'Portico Room', 'Tabularium', 'Aqueduct Room', 'Lower Cloister', 'Marble Court',
] as const;

export type SizedDemoResult = {
  slug: string;
  size: EventSize['key'];
  speakers: number;
  submissions: number;
  scheduledSessions: number;
};

export async function seedSizedDemo(
  db: Database,
  params: { size: EventSize; organizerUserId: string; now: Date },
): Promise<SizedDemoResult> {
  const { size, organizerUserId, now } = params;
  const timezone = 'America/Los_Angeles';
  const domain = generatedEmailDomain(size);

  // Deliberately not six weeks out like `demo`: three sample events landing on the same dates would
  // make every "what is coming up" surface look like one conference triple-booked with itself.
  const firstDay = new Date(now.getTime() + (size.key === 'small' ? 21 : 70) * DAY);
  firstDay.setUTCHours(0, 0, 0, 0);
  const days = Array.from({ length: size.days }, (_, index) => new Date(firstDay.getTime() + index * DAY));
  const lastDay = days[days.length - 1]!;

  const isoDate = (date: Date) => date.toISOString().slice(0, 10);
  /** Wall-clock in the event's UTC-8 zone, matching `db/seed.ts`. */
  const at = (day: Date, hour: number) => new Date(day.getTime() + (hour + 8) * 3_600_000);
  const ago = (offset: number) => new Date(now.getTime() - offset * DAY);

  const window = requireEventWindow(
    timezone,
    `${isoDate(firstDay)}T09:00`,
    `${isoDate(lastDay)}T17:00`,
  );

  const [created] = await db
    .insert(event)
    .values({
      slug: size.slug,
      name: size.name,
      tagline: size.tagline,
      descriptionMarkdown:
        `The ${size.key} sample event: ${size.speakers} speakers, ${size.submissions} proposals, ` +
        `${size.rooms} rooms over ${size.days} day${size.days === 1 ? '' : 's'}. It exists beside ` +
        'the default `demo` event so the same screens can be read at a different scale. Everything ' +
        'here is generated and editable — break it freely.',
      eventType: 'Conference',
      timezone: window.timezone,
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      startsOn: window.startsOn,
      endsOn: window.endsOn,
      venueName: 'The Getty Villa',
      venueAddress: '17985 Pacific Coast Highway, Pacific Palisades, CA',
      ownerUserId: organizerUserId,
    })
    .returning();

  // Generated at a high index so no reviewer can collide with a speaker on the same domain: the
  // name tables are walked by index, and these two ranges never meet.
  const reviewerPeople = Array.from({ length: size.reviewers }, (_, index) =>
    generatedSpeakerAt(1000 + index, domain),
  );
  const reviewerUsers = await db
    .insert(user)
    .values(
      reviewerPeople.map((person) => ({
        email: person.email,
        name: person.name,
        ...splitPersonName(person.name),
      })),
    )
    .returning();

  await db.insert(membership).values([
    { userId: organizerUserId, eventId: created.id, role: 'organizer' as const },
    ...reviewerUsers.map((reviewer) => ({
      userId: reviewer.id,
      eventId: created.id,
      role: 'reviewer' as const,
    })),
  ]);

  const tracks = await db
    .insert(track)
    .values(
      TRACK_NAMES.slice(0, size.key === 'small' ? 2 : 4).map((entry, index) => ({
        eventId: created.id,
        name: entry.name,
        color: entry.color,
        position: index,
      })),
    )
    .returning();

  const rooms = await db
    .insert(room)
    .values(
      Array.from({ length: size.rooms }, (_, index) => ({
        eventId: created.id,
        name: ROOM_NAMES[index % ROOM_NAMES.length]!,
        capacity: index === 0 ? 600 : 120,
        floor: index < 2 ? 'Ground' : 'Lower level',
        position: index,
      })),
    )
    .returning();

  const formats = await db
    .insert(sessionFormat)
    .values([
      { eventId: created.id, name: 'Keynote', durationMinutes: 45, position: 0 },
      { eventId: created.id, name: 'Talk', durationMinutes: 30, position: 1 },
      { eventId: created.id, name: 'Workshop', durationMinutes: 90, position: 2 },
    ])
    .returning();

  const personas = await db
    .insert(persona)
    .values([
      {
        eventId: created.id,
        name: 'Public works engineer',
        description: 'Builds and maintains the city',
        position: 0,
      },
      {
        eventId: created.id,
        name: 'Civic leader',
        description: 'Makes policy and coordinates institutions',
        position: 1,
      },
    ])
    .returning();

  const [cfp] = await db
    .insert(form)
    .values({
      eventId: created.id,
      kind: 'cfp',
      targetType: 'abstract',
      collectsParticipants: true,
      name: `${size.name} — main call`,
      externalTitle: `${size.name} call for speakers`,
      pageHeading: 'Speak with us',
      showWelcome: true,
      slug: 'speak',
      status: 'open',
      maxParticipants: 4,
      introMarkdown:
        'Practical talks rooted in Roman infrastructure, governance, knowledge, or logistics. ' +
        'Show the work rather than the legend.',
      closesAt: new Date(firstDay.getTime() - 14 * DAY),
    })
    .returning();

  await db.insert(formField).values(seedBuiltinFields(cfp.id));
  await db.insert(formParticipantRole).values(seedRoles(cfp.id));

  const [round] = await db
    .insert(reviewRound)
    .values({
      eventId: created.id,
      name: 'First pass',
      position: 0,
      status: 'open',
      blindUntilClose: true,
      opensAt: ago(30),
      closesAt: new Date(now.getTime() + 7 * DAY),
    })
    .returning();

  const criteria = await db
    .insert(scorecardCriterion)
    .values([
      {
        reviewRoundId: round.id,
        label: 'Relevance',
        description: 'Does this matter to the audience we are convening?',
        weight: 2,
        maxScore: 5,
        position: 0,
      },
      {
        reviewRoundId: round.id,
        label: 'Depth',
        description: 'Is there something here you cannot get from a blog post?',
        weight: 2,
        maxScore: 5,
        position: 1,
      },
      {
        reviewRoundId: round.id,
        label: 'Speaker readiness',
        description: 'Evidence they can deliver it well.',
        weight: 1,
        maxScore: 5,
        position: 2,
      },
    ])
    .returning();

  const filled = await seedSizedRoster(db, {
    eventId: created.id,
    size,
    organizerUserId,
    formId: cfp.id,
    timezone,
    tracks,
    formats,
    rooms,
    personas,
    days: days.map((day) => at(day, 0)),
    now,
    // Nothing is hand-written on these events, so the generator supplies the whole programme.
    existing: { speakers: 0, submissions: 0, sessions: 0 },
    reservedRooms: 0,
    review: {
      roundId: round.id,
      reviewerUserIds: reviewerUsers.map((reviewer) => reviewer.id),
      criteria,
    },
  });

  return {
    slug: size.slug,
    size: size.key,
    speakers: filled.speakers,
    submissions: filled.submissions,
    scheduledSessions: filled.scheduledSessions,
  };
}
