import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, type Database } from '@/db/client';
import {
  event,
  participant,
  participantRole,
  room,
  scheduledSession,
  sessionFormat,
  track,
  user,
} from '@/db/schema';
import { normalizeHeader, parseCsvTable } from '@/lib/csv';
import { conflict, invalid, notFound } from '@/lib/errors';
import { newIcsUid } from '@/lib/ics';
import { sendSessionInvites } from '@/lib/services/comms';
import {
  canPublish,
  detectConflicts,
  isPlaced,
  type Conflict,
  type ScheduleEntry,
  type SpeakerRef,
} from '@/lib/services/schedule';

const optionalCell = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().optional(),
);
const optionalTimestamp = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().datetime({ offset: true }).optional(),
);

export const sessionSyncRowSchema = z
  .object({
    action: z.preprocess(
      (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
      z.enum(['create', 'update', 'delete']),
    ),
    client_id: z.string().trim().min(1).max(120),
    title: optionalCell,
    description: optionalCell,
    room: optionalCell,
    track: optionalCell,
    format: optionalCell,
    starts_at: optionalTimestamp,
    ends_at: optionalTimestamp,
    ceu_credits: optionalCell,
  })
  .superRefine((row, context) => {
    if (row.action === 'delete') return;

    for (const field of ['title', 'room', 'starts_at', 'ends_at'] as const) {
      if (!row[field]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} is required for ${row.action}`,
        });
      }
    }

    if (row.starts_at && row.ends_at) {
      const startsAt = new Date(row.starts_at);
      const endsAt = new Date(row.ends_at);
      if (endsAt.getTime() <= startsAt.getTime()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ends_at'],
          message: 'ends_at must be after starts_at',
        });
      }
    }
  })
  .describe('One Excel-shaped agenda sync row');

export const sessionSyncJsonBodySchema = z
  .object({ rows: z.array(sessionSyncRowSchema).min(1).max(1000) })
  .describe('Excel-shaped rows using the same column names as the CSV import');

export const sessionSyncResultSchema = z.object({
  dryRun: z.boolean(),
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  deleted: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  changes: z.array(
    z.object({
      row: z.number().int().positive(),
      clientId: z.string(),
      action: z.enum(['create', 'update', 'delete']),
      outcome: z.enum(['created', 'updated', 'deleted', 'unchanged']),
    }),
  ),
  conflicts: z.array(
    z.object({
      kind: z.enum(['room', 'track', 'speaker']),
      severity: z.enum(['error', 'warning']),
      sessionIds: z.tuple([z.string(), z.string()]),
      message: z.string(),
    }),
  ),
  calendarNotifications: z.object({
    planned: z.number().int().nonnegative(),
    attempted: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
});

export type SessionSyncRow = z.infer<typeof sessionSyncRowSchema>;
export type SessionSyncResult = z.infer<typeof sessionSyncResultSchema>;

const HEADER_ALIASES: Record<string, keyof SessionSyncRow> = {
  action: 'action',
  'client id': 'client_id',
  clientid: 'client_id',
  title: 'title',
  description: 'description',
  'description markdown': 'description',
  room: 'room',
  track: 'track',
  format: 'format',
  'starts at': 'starts_at',
  start: 'starts_at',
  'ends at': 'ends_at',
  end: 'ends_at',
  'ceu credits': 'ceu_credits',
};

export function parseSessionSyncCsv(csv: string): SessionSyncRow[] {
  const table = parseCsvTable(csv);
  const columns = table.headers.map((header) => HEADER_ALIASES[normalizeHeader(header)]);
  const canonical = columns.filter((column): column is keyof SessionSyncRow => Boolean(column));
  const missing = (['action', 'client_id'] as const).filter((column) => !canonical.includes(column));
  if (missing.length > 0) {
    throw invalid('That session sync CSV is missing required columns', {
      headers: `Add ${missing.join(', ')}`,
    });
  }
  if (new Set(canonical).size !== canonical.length) {
    throw invalid('That session sync CSV maps more than one header to the same field');
  }

  const rows = table.rows.map((cells) =>
    Object.fromEntries(
      columns.flatMap((column, index) => (column ? [[column, cells[index]]] : [])),
    ),
  );
  const parsed = sessionSyncJsonBodySchema.safeParse({ rows });
  if (!parsed.success) {
    throw invalid('That session sync CSV is not valid', zodDetails(parsed.error));
  }
  return parsed.data.rows;
}

function zodDetails(error: z.ZodError): Record<string, string> {
  return Object.fromEntries(
    error.issues.map((issue) => [issue.path.join('.') || '_', issue.message]),
  );
}

export type SessionSyncSession = ScheduleEntry & {
  eventId: string;
  descriptionMarkdown: string | null;
  icsUid: string;
  icsSequence: number;
};

export type SessionSyncSnapshot = {
  sessions: SessionSyncSession[];
  rooms: Array<{ id: string; name: string }>;
  tracks: Array<{ id: string; name: string }>;
  formats: Array<{ id: string; name: string }>;
};

type SessionValues = {
  title: string;
  descriptionMarkdown: string | null;
  roomId: string;
  trackId: string | null;
  formatId: string | null;
  startsAt: Date;
  endsAt: Date;
  ceuCredits: string | null;
  clientId: string;
  status: 'published';
};

type CreateMutation = {
  kind: 'create';
  row: SessionSyncRow;
  rowNumber: number;
  values: SessionValues;
};

type UpdateMutation = {
  kind: 'update';
  row: SessionSyncRow;
  rowNumber: number;
  existing: SessionSyncSession;
  values: SessionValues;
};

type DeleteMutation = {
  kind: 'delete';
  row: SessionSyncRow;
  rowNumber: number;
  existing: SessionSyncSession;
};

type SessionMutation = CreateMutation | UpdateMutation | DeleteMutation;

export type SessionSyncPlan = Omit<SessionSyncResult, 'dryRun' | 'calendarNotifications'> & {
  mutations: SessionMutation[];
  finalEntries: ScheduleEntry[];
  notificationsPlanned: number;
};

function resolveReference(
  value: string | undefined,
  choices: Array<{ id: string; name: string }>,
  field: 'room' | 'track' | 'format',
  rowNumber: number,
): string | null {
  if (!value) return null;
  const byId = choices.find((choice) => choice.id === value);
  if (byId) return byId.id;

  const matches = choices.filter(
    (choice) => choice.name.trim().toLocaleLowerCase() === value.trim().toLocaleLowerCase(),
  );
  if (matches.length === 1) return matches[0].id;
  if (matches.length > 1) {
    throw invalid('That session sync row uses an ambiguous event value', {
      [`rows.${rowNumber}.${field}`]: `${value} matches more than one ${field}`,
    });
  }
  throw invalid('That session sync row references a value outside this event', {
    [`rows.${rowNumber}.${field}`]: `${value} is not an event ${field}`,
  });
}

function valuesForRow(
  row: SessionSyncRow,
  rowNumber: number,
  snapshot: SessionSyncSnapshot,
): SessionValues {
  const values: SessionValues = {
    title: row.title as string,
    descriptionMarkdown: row.description ?? null,
    roomId: resolveReference(row.room, snapshot.rooms, 'room', rowNumber) as string,
    trackId: resolveReference(row.track, snapshot.tracks, 'track', rowNumber),
    formatId: resolveReference(row.format, snapshot.formats, 'format', rowNumber),
    startsAt: new Date(row.starts_at as string),
    endsAt: new Date(row.ends_at as string),
    ceuCredits: row.ceu_credits ?? null,
    clientId: row.client_id,
    status: 'published',
  };

  const entry: ScheduleEntry = {
    id: `sync:${row.client_id}`,
    ref: 0,
    title: values.title,
    submissionId: null,
    roomId: values.roomId,
    trackId: values.trackId,
    formatId: values.formatId,
    startsAt: values.startsAt,
    endsAt: values.endsAt,
    status: values.status,
    ceuCredits: values.ceuCredits,
    clientId: values.clientId,
    speakers: [],
  };
  if (!canPublish(entry)) {
    throw invalid('Every created or updated row needs a room and a valid time range', {
      [`rows.${rowNumber}`]: 'This row cannot be published',
    });
  }
  return values;
}

function sameDate(left: Date | null, right: Date): boolean {
  return left instanceof Date && left.getTime() === right.getTime();
}

function matchesValues(existing: SessionSyncSession, values: SessionValues): boolean {
  return (
    existing.title === values.title &&
    existing.descriptionMarkdown === values.descriptionMarkdown &&
    existing.roomId === values.roomId &&
    existing.trackId === values.trackId &&
    existing.formatId === values.formatId &&
    sameDate(existing.startsAt, values.startsAt) &&
    sameDate(existing.endsAt, values.endsAt) &&
    existing.ceuCredits === values.ceuCredits &&
    existing.status === values.status
  );
}

function withValues(existing: SessionSyncSession, values: SessionValues): SessionSyncSession {
  return { ...existing, ...values };
}

function provisional(values: SessionValues): ScheduleEntry {
  return {
    id: `sync:${values.clientId}`,
    ref: 0,
    title: values.title,
    submissionId: null,
    roomId: values.roomId,
    trackId: values.trackId,
    formatId: values.formatId,
    startsAt: values.startsAt,
    endsAt: values.endsAt,
    status: values.status,
    ceuCredits: values.ceuCredits,
    clientId: values.clientId,
    speakers: [],
  };
}

function publicConflict(conflictRow: Conflict): SessionSyncPlan['conflicts'][number] {
  return {
    kind: conflictRow.kind,
    severity: conflictRow.severity,
    sessionIds: conflictRow.sessionIds,
    message: conflictRow.message,
  };
}

export function planSessionSync(
  rows: SessionSyncRow[],
  snapshot: SessionSyncSnapshot,
): SessionSyncPlan {
  const duplicateInput = rows.find(
    (row, index) => rows.findIndex((candidate) => candidate.client_id === row.client_id) !== index,
  );
  if (duplicateInput) {
    throw invalid('Each client_id may appear only once per sync request', {
      client_id: duplicateInput.client_id,
    });
  }

  const existingByClient = new Map<string, SessionSyncSession>();
  for (const session of snapshot.sessions) {
    if (!session.clientId) continue;
    if (existingByClient.has(session.clientId)) {
      throw conflict('Existing sessions have duplicate client IDs', {
        client_id: session.clientId,
      });
    }
    existingByClient.set(session.clientId, session);
  }

  const finalById = new Map(snapshot.sessions.map((session) => [session.id, session]));
  const additions: ScheduleEntry[] = [];
  const mutations: SessionMutation[] = [];
  const changes: SessionSyncPlan['changes'] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const existing = existingByClient.get(row.client_id);

    if (row.action === 'delete') {
      if (!existing) {
        throw conflict('A delete row did not match a session in this event', {
          [`rows.${rowNumber}.client_id`]: row.client_id,
        });
      }
      if (existing.status === 'cancelled') {
        changes.push({
          row: rowNumber,
          clientId: row.client_id,
          action: row.action,
          outcome: 'unchanged',
        });
        return;
      }

      mutations.push({ kind: 'delete', row, rowNumber, existing });
      finalById.set(existing.id, { ...existing, status: 'cancelled' });
      changes.push({
        row: rowNumber,
        clientId: row.client_id,
        action: row.action,
        outcome: 'deleted',
      });
      return;
    }

    const values = valuesForRow(row, rowNumber, snapshot);
    if (row.action === 'create') {
      if (existing) {
        if (!matchesValues(existing, values)) {
          throw conflict('A create row reused a client_id with different session data', {
            [`rows.${rowNumber}.client_id`]: row.client_id,
          });
        }
        changes.push({
          row: rowNumber,
          clientId: row.client_id,
          action: row.action,
          outcome: 'unchanged',
        });
        return;
      }

      mutations.push({ kind: 'create', row, rowNumber, values });
      additions.push(provisional(values));
      changes.push({
        row: rowNumber,
        clientId: row.client_id,
        action: row.action,
        outcome: 'created',
      });
      return;
    }

    if (!existing) {
      throw conflict('An update row did not match a session in this event', {
        [`rows.${rowNumber}.client_id`]: row.client_id,
      });
    }
    if (matchesValues(existing, values)) {
      changes.push({
        row: rowNumber,
        clientId: row.client_id,
        action: row.action,
        outcome: 'unchanged',
      });
      return;
    }

    mutations.push({ kind: 'update', row, rowNumber, existing, values });
    finalById.set(existing.id, withValues(existing, values));
    changes.push({
      row: rowNumber,
      clientId: row.client_id,
      action: row.action,
      outcome: 'updated',
    });
  });

  const finalEntries = [...finalById.values(), ...additions];
  const counts = (outcome: SessionSyncPlan['changes'][number]['outcome']) =>
    changes.filter((change) => change.outcome === outcome).length;
  const notificationsPlanned = mutations.filter(
    (mutation) =>
      mutation.kind !== 'delete' ||
      (mutation.existing.status === 'published' && isPlaced(mutation.existing)),
  ).length;

  return {
    created: counts('created'),
    updated: counts('updated'),
    deleted: counts('deleted'),
    unchanged: counts('unchanged'),
    changes,
    conflicts: detectConflicts(finalEntries, {
      rooms: Object.fromEntries(snapshot.rooms.map((value) => [value.id, value.name])),
      tracks: Object.fromEntries(snapshot.tracks.map((value) => [value.id, value.name])),
    }).map(publicConflict),
    mutations,
    finalEntries,
    notificationsPlanned,
  };
}

type SessionPatch = Omit<Partial<SessionValues>, 'status'> & {
  status?: 'published' | 'cancelled';
};

export type SessionSyncStore = {
  transaction<T>(work: (transaction: SessionSyncStore) => Promise<T>): Promise<T>;
  loadSnapshot(eventId: string, lock: boolean): Promise<SessionSyncSnapshot>;
  reserveSessionRefs(eventId: string, count: number): Promise<number[]>;
  insertSession(eventId: string, ref: number, values: SessionValues): Promise<string>;
  updateSession(eventId: string, sessionId: string, patch: SessionPatch): Promise<void>;
};

type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type DatabaseExecutor = Database | DatabaseTransaction;

async function loadSnapshotFrom(
  database: DatabaseExecutor,
  eventId: string,
  lock: boolean,
): Promise<SessionSyncSnapshot> {
  const eventRows = lock
    ? await database
        .select({ id: event.id })
        .from(event)
        .where(eq(event.id, eventId))
        .for('update')
    : await database.select({ id: event.id }).from(event).where(eq(event.id, eventId));
  if (eventRows.length === 0) throw notFound('That event');

  const [sessionRows, roomRows, trackRows, formatRows] = await Promise.all([
    database.select().from(scheduledSession).where(eq(scheduledSession.eventId, eventId)),
    database.select({ id: room.id, name: room.name }).from(room).where(eq(room.eventId, eventId)),
    database.select({ id: track.id, name: track.name }).from(track).where(eq(track.eventId, eventId)),
    database
      .select({ id: sessionFormat.id, name: sessionFormat.name })
      .from(sessionFormat)
      .where(eq(sessionFormat.eventId, eventId)),
  ]);

  const submissionIds = sessionRows
    .map((session) => session.submissionId)
    .filter((submissionId): submissionId is string => Boolean(submissionId));
  const speakerRows =
    submissionIds.length === 0
      ? []
      : await database
          .select({
            submissionId: participantRole.submissionId,
            participantId: participant.id,
            displayName: participant.displayName,
            userName: user.name,
            email: user.email,
          })
          .from(participantRole)
          .innerJoin(participant, eq(participant.id, participantRole.participantId))
          .innerJoin(user, eq(user.id, participant.userId))
          .where(inArray(participantRole.submissionId, submissionIds));
  const speakers = new Map<string, SpeakerRef[]>();
  for (const speaker of speakerRows) {
    speakers.set(speaker.submissionId, [
      ...(speakers.get(speaker.submissionId) ?? []),
      {
        participantId: speaker.participantId,
        name: speaker.displayName ?? speaker.userName ?? speaker.email,
      },
    ]);
  }

  return {
    sessions: sessionRows.map((session) => ({
      id: session.id,
      eventId: session.eventId,
      ref: session.ref,
      title: session.title,
      submissionId: session.submissionId,
      descriptionMarkdown: session.descriptionMarkdown,
      roomId: session.roomId,
      trackId: session.trackId,
      formatId: session.formatId,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      status: session.status,
      ceuCredits: session.ceuCredits,
      clientId: session.clientId,
      icsUid: session.icsUid,
      icsSequence: session.icsSequence,
      speakers: session.submissionId ? (speakers.get(session.submissionId) ?? []) : [],
    })),
    rooms: roomRows,
    tracks: trackRows,
    formats: formatRows,
  };
}

function drizzleStore(
  database: DatabaseExecutor,
  runTransaction?: <T>(work: (transaction: SessionSyncStore) => Promise<T>) => Promise<T>,
): SessionSyncStore {
  const store: SessionSyncStore = {
    transaction: <T>(work: (transaction: SessionSyncStore) => Promise<T>) =>
      runTransaction ? runTransaction(work) : work(store),
    loadSnapshot: (eventId, lock) => loadSnapshotFrom(database, eventId, lock),
    reserveSessionRefs: async (eventId, count) => {
      if (count === 0) return [];
      const [row] = await database
        .update(event)
        .set({ sessionSeq: sql`${event.sessionSeq} + ${count}`, updatedAt: new Date() })
        .where(eq(event.id, eventId))
        .returning({ lastRef: event.sessionSeq });
      if (!row) throw notFound('That event');
      return Array.from({ length: count }, (_, index) => row.lastRef - count + index + 1);
    },
    insertSession: async (eventId, ref, values) => {
      const [created] = await database
        .insert(scheduledSession)
        .values({
          eventId,
          ref,
          submissionId: null,
          ...values,
          icsUid: newIcsUid(),
        })
        .returning({ id: scheduledSession.id });
      if (!created) throw new Error('The session could not be created');
      return created.id;
    },
    updateSession: async (eventId, sessionId, patch) => {
      const [updated] = await database
        .update(scheduledSession)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(scheduledSession.id, sessionId), eq(scheduledSession.eventId, eventId)))
        .returning({ id: scheduledSession.id });
      if (!updated) throw conflict('A session changed while this sync was being applied');
    },
  };
  return store;
}

export function createSessionSyncStore(database: Database = getDb()): SessionSyncStore {
  return drizzleStore(database, (work) =>
    database.transaction((transaction) => work(drizzleStore(transaction))),
  );
}

type CalendarNotification = { sessionId: string; cancel: boolean };

export type SessionSyncOptions = {
  dryRun: boolean;
  store?: SessionSyncStore;
  notify?: (sessionId: string, options: { cancel: boolean }) => Promise<void>;
};

function uniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

export async function syncPublishedSessions(
  eventId: string,
  rows: SessionSyncRow[],
  options: SessionSyncOptions,
): Promise<SessionSyncResult> {
  const store = options.store ?? createSessionSyncStore();
  if (options.dryRun) {
    const plan = planSessionSync(rows, await store.loadSnapshot(eventId, false));
    return {
      dryRun: true,
      created: plan.created,
      updated: plan.updated,
      deleted: plan.deleted,
      unchanged: plan.unchanged,
      changes: plan.changes,
      conflicts: plan.conflicts,
      calendarNotifications: {
        planned: plan.notificationsPlanned,
        attempted: 0,
        failed: 0,
      },
    };
  }

  let committed: { plan: SessionSyncPlan; notifications: CalendarNotification[] };
  try {
    committed = await store.transaction(async (transaction) => {
      const plan = planSessionSync(rows, await transaction.loadSnapshot(eventId, true));
      const refs = await transaction.reserveSessionRefs(eventId, plan.created);
      const notifications: CalendarNotification[] = [];
      let refIndex = 0;

      for (const mutation of plan.mutations) {
        if (mutation.kind === 'create') {
          const sessionId = await transaction.insertSession(
            eventId,
            refs[refIndex] as number,
            mutation.values,
          );
          refIndex += 1;
          notifications.push({ sessionId, cancel: false });
          continue;
        }
        if (mutation.kind === 'update') {
          await transaction.updateSession(eventId, mutation.existing.id, mutation.values);
          notifications.push({ sessionId: mutation.existing.id, cancel: false });
          continue;
        }

        await transaction.updateSession(eventId, mutation.existing.id, { status: 'cancelled' });
        if (mutation.existing.status === 'published' && isPlaced(mutation.existing)) {
          notifications.push({ sessionId: mutation.existing.id, cancel: true });
        }
      }
      return { plan, notifications };
    });
  } catch (error) {
    if (uniqueViolation(error)) {
      throw conflict('Another sync claimed one of those client IDs; preview the file again');
    }
    throw error;
  }

  const notify =
    options.notify ??
    (async (sessionId: string, notification: { cancel: boolean }) => {
      await sendSessionInvites(sessionId, notification.cancel ? { cancel: true } : {});
    });
  const notificationResults = await Promise.allSettled(
    committed.notifications.map((notification) =>
      notify(notification.sessionId, { cancel: notification.cancel }),
    ),
  );
  const failed = notificationResults.filter((result) => result.status === 'rejected').length;
  for (const result of notificationResults) {
    if (result.status === 'rejected') {
      console.error(result.reason instanceof Error ? result.reason.message : String(result.reason));
    }
  }

  return {
    dryRun: false,
    created: committed.plan.created,
    updated: committed.plan.updated,
    deleted: committed.plan.deleted,
    unchanged: committed.plan.unchanged,
    changes: committed.plan.changes,
    conflicts: committed.plan.conflicts,
    calendarNotifications: {
      planned: committed.plan.notificationsPlanned,
      attempted: committed.notifications.length,
      failed,
    },
  };
}
