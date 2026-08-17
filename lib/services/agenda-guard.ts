import { asc, eq, inArray, sql } from 'drizzle-orm';
import { getDb, type Database } from '../../db/client';
import {
  event,
  participant,
  participantRole,
  scheduledSession,
  speakerUnavailability,
  user,
} from '../../db/schema';
import { runAtomicAgendaMutation, type AgendaMutation } from './agenda-atomic';
import {
  parseConflictPolicy,
  type Conflict,
  type ConflictPolicy,
  type ScheduleEntry,
  type SpeakerRef,
  type SpeakerUnavailability,
} from './schedule';

type TransactionCallback = Parameters<Database['transaction']>[0];
export type AgendaTransaction = Parameters<TransactionCallback>[0];

async function loadEntries(
  transaction: AgendaTransaction,
  eventId: string,
): Promise<ScheduleEntry[]> {
  const sessions = await transaction.query.scheduledSession.findMany({
    where: eq(scheduledSession.eventId, eventId),
  });
  const submissionIds = [
    ...new Set(
      sessions.map((session) => session.submissionId).filter((id): id is string => Boolean(id)),
    ),
  ];
  const speakers = new Map<string, SpeakerRef[]>();

  if (submissionIds.length > 0) {
    const roles = await transaction
      .select({
        submissionId: participantRole.submissionId,
        participantId: participantRole.participantId,
        displayName: participant.displayName,
        userName: user.name,
        email: user.email,
      })
      .from(participantRole)
      .innerJoin(participant, eq(participant.id, participantRole.participantId))
      .innerJoin(user, eq(user.id, participant.userId))
      .where(inArray(participantRole.submissionId, submissionIds))
      .orderBy(asc(participantRole.position));

    for (const role of roles) {
      speakers.set(role.submissionId, [
        ...(speakers.get(role.submissionId) ?? []),
        {
          participantId: role.participantId,
          name: role.displayName ?? role.userName ?? role.email,
        },
      ]);
    }
  }

  return sessions.map((session) => ({
    id: session.id,
    ref: session.ref,
    title: session.title,
    submissionId: session.submissionId,
    roomId: session.roomId,
    trackId: session.trackId,
    formatId: session.formatId,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    status: session.status,
    ceuCredits: session.ceuCredits,
    clientId: session.clientId,
    speakers: session.submissionId ? (speakers.get(session.submissionId) ?? []) : [],
  }));
}

/** `AR-35`. Read under the same lock as the entries so the decision cannot straddle a policy change. */
async function loadPolicy(
  transaction: AgendaTransaction,
  eventId: string,
): Promise<ConflictPolicy> {
  const row = await transaction.query.event.findFirst({ where: eq(event.id, eventId) });
  return parseConflictPolicy(row?.agendaConflictPolicy);
}

/**
 * `AD-2`. Under the same lock again: a speaker adding a blackout while an organizer drags into it
 * should resolve one way or the other, not half-see the window.
 */
async function loadUnavailability(
  transaction: AgendaTransaction,
  eventId: string,
): Promise<SpeakerUnavailability[]> {
  const rows = await transaction.query.speakerUnavailability.findMany({
    where: eq(speakerUnavailability.eventId, eventId),
  });
  return rows.map((row) => ({
    participantId: row.participantId,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    timezone: row.authoredTimezone,
    note: row.note,
  }));
}

export type AtomicAgendaOptions = {
  /**
   * Clashes the event's `warn` policy let through. They committed, so this is not an error path —
   * it is how the caller tells the organizer what they just created instead of letting a
   * double-booking reach the printed programme unannounced.
   */
  onWarn?: (conflicts: Conflict[]) => void;
};

export async function mutateAgendaAtomically<T>(
  eventId: string,
  mutate: (transaction: AgendaTransaction) => Promise<AgendaMutation<T>>,
  options: AtomicAgendaOptions = {},
): Promise<T> {
  const db = getDb();
  return runAtomicAgendaMutation<T, AgendaTransaction>(
    {
      transaction: (work) => db.transaction(work),
      lock: async (transaction) => {
        await transaction.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${eventId}, 0))`,
        );
      },
      loadEntries: (transaction) => loadEntries(transaction, eventId),
      loadPolicy: (transaction) => loadPolicy(transaction, eventId),
      loadUnavailability: (transaction) => loadUnavailability(transaction, eventId),
      onWarn: options.onWarn ? (conflicts) => options.onWarn?.(conflicts) : undefined,
    },
    mutate,
  );
}

/** The organizer's toggle. `agenda:manage` is the capability, because this is an agenda rule. */
export async function setAgendaConflictPolicy(
  eventId: string,
  policy: ConflictPolicy,
): Promise<ConflictPolicy> {
  const [row] = await getDb()
    .update(event)
    .set({ agendaConflictPolicy: policy, updatedAt: new Date() })
    .where(eq(event.id, eventId))
    .returning({ policy: event.agendaConflictPolicy });
  if (!row) throw new Error('That event could not be found');
  return parseConflictPolicy(row.policy);
}
