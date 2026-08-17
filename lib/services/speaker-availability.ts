import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../db/client';
import { speakerUnavailability } from '../../db/schema';
import { invalid, notFound } from '../errors';
import { zonedTimeToUtc, type SpeakerUnavailability } from './schedule';

/**
 * `AD-2`. The speaker's side of scheduling: the windows they have declared they cannot present in.
 *
 * **Why blackout and not availability.** A row here says "not then". No rows says nothing at all.
 * The inverse model — rows meaning "only then" — makes the empty state read as *available never*,
 * so every speaker who never opens the portal turns into an unschedulable one and the organizer's
 * board fills with conflicts no human authored. It is also the smaller ask of the speaker: they know
 * their one Thursday clash, not their whole free/busy calendar.
 *
 * **Where the timezone is resolved.** Here, once, on the way in. The speaker types a wall clock;
 * `zonedTimeToUtc` turns it into an instant using the zone they are told they are typing in, and the
 * instant is what gets stored and compared. Nothing downstream converts anything. See the note on
 * `SpeakerUnavailability` in `schedule.ts` for why the alternative — storing wall clock plus zone
 * and converting at compare time — is the shape in which this feature silently means two different
 * things to the two people who read it.
 */

/** A stored window. `SpeakerUnavailability` is what the detector needs; the id is what the portal needs to delete one. */
export type UnavailabilityWindow = SpeakerUnavailability & { id: string };

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^\d{2}:\d{2}$/;

/** A day with no `to` date is a single day; a blank time means the edge of that day. */
export const unavailabilityInputSchema = z
  .object({
    startDate: z.string().regex(DAY_KEY, 'Pick a start date'),
    startTime: z.string().regex(CLOCK).or(z.literal('')).default(''),
    endDate: z.string().regex(DAY_KEY, 'Pick an end date').or(z.literal('')).default(''),
    endTime: z.string().regex(CLOCK).or(z.literal('')).default(''),
    note: z.string().max(280, 'Keep the note under 280 characters').optional(),
    /** IANA zone the wall clocks above are expressed in. */
    timezone: z.string().min(1),
  })
  .refine((value) => !value.endDate || value.endDate >= value.startDate, {
    message: 'The end date cannot be before the start date',
    path: ['endDate'],
  });

export type UnavailabilityInput = z.input<typeof unavailabilityInputSchema>;

function minutesFromClock(clock: string, fallback: number): number {
  if (!CLOCK.test(clock)) return fallback;
  const [hours, minutes] = clock.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Wall clock to instant. The end of an all-day window is minute 1440 of its last day rather than
 * 23:59 — half-open intervals are what the whole detector is built on, and 23:59 would leave a
 * one-minute hole a session could technically be scheduled into.
 */
export function resolveWindow(input: UnavailabilityInput): { startsAt: Date; endsAt: Date } {
  const parsed = unavailabilityInputSchema.parse(input);
  const endDate = parsed.endDate || parsed.startDate;
  const startsAt = zonedTimeToUtc(
    parsed.startDate,
    minutesFromClock(parsed.startTime, 0),
    parsed.timezone,
  );
  const endsAt = zonedTimeToUtc(
    endDate,
    minutesFromClock(parsed.endTime, 24 * 60),
    parsed.timezone,
  );
  return { startsAt, endsAt };
}

function toWindow(row: typeof speakerUnavailability.$inferSelect): UnavailabilityWindow {
  return {
    id: row.id,
    participantId: row.participantId,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    timezone: row.authoredTimezone,
    note: row.note,
  };
}

/** One speaker's own windows, for the portal. */
export async function listMyUnavailability(
  eventId: string,
  participantId: string,
): Promise<UnavailabilityWindow[]> {
  const rows = await getDb().query.speakerUnavailability.findMany({
    where: and(
      eq(speakerUnavailability.eventId, eventId),
      eq(speakerUnavailability.participantId, participantId),
    ),
    orderBy: [asc(speakerUnavailability.startsAt)],
  });
  return rows.map(toWindow);
}

/**
 * Every window on the event, for the organizer's board. One query rather than one per speaker: the
 * detector needs the whole set anyway, and an event's blackouts are a handful of rows.
 */
export async function listEventUnavailability(eventId: string): Promise<UnavailabilityWindow[]> {
  const rows = await getDb().query.speakerUnavailability.findMany({
    where: eq(speakerUnavailability.eventId, eventId),
    orderBy: [asc(speakerUnavailability.startsAt)],
  });
  return rows.map(toWindow);
}

export async function addUnavailability(
  eventId: string,
  participantId: string,
  input: UnavailabilityInput,
): Promise<UnavailabilityWindow> {
  const parsed = unavailabilityInputSchema.safeParse(input);
  if (!parsed.success) {
    const details: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      details[issue.path.join('.') || 'form'] = issue.message;
    }
    throw invalid('That window needs attention', details);
  }

  const { startsAt, endsAt } = resolveWindow(parsed.data);
  /**
   * The database has the same check constraint. This one exists to turn it into a sentence a speaker
   * can act on rather than a driver error — a same-day window with the end time before the start is
   * the ordinary way to arrive here.
   */
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw invalid('That window needs attention', {
      endTime: 'The window has to end after it starts',
    });
  }

  const note = parsed.data.note?.trim();
  const [row] = await getDb()
    .insert(speakerUnavailability)
    .values({
      eventId,
      participantId,
      startsAt,
      endsAt,
      authoredTimezone: parsed.data.timezone,
      note: note ? note : null,
    })
    .returning();
  if (!row) throw new Error('That window could not be saved');
  return toWindow(row);
}

/**
 * Scoped by participant as well as by id, so an organizer impersonating one speaker cannot delete
 * another's window by guessing a uuid — `S-10` makes the acting participant the authority here, not
 * the signed-in user.
 */
export async function removeUnavailability(
  eventId: string,
  participantId: string,
  id: string,
): Promise<void> {
  const [row] = await getDb()
    .delete(speakerUnavailability)
    .where(
      and(
        eq(speakerUnavailability.id, id),
        eq(speakerUnavailability.eventId, eventId),
        eq(speakerUnavailability.participantId, participantId),
      ),
    )
    .returning({ id: speakerUnavailability.id });
  if (!row) throw notFound('That unavailable window');
}
