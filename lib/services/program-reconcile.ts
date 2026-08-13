import { and, eq, sql } from 'drizzle-orm';
import { getDb, type Database } from '@/db/client';
import { room, scheduledSession, sessionFormat, track } from '@/db/schema';
import { conflict } from '@/lib/errors';
import {
  allocateSessionRef,
  cancelPublishedSessionBeforeMutation,
  mintIcsUid,
  notifyIfPublished,
} from '@/lib/services/agenda-mutations';
import { detectConflicts, type ScheduleEntry } from '@/lib/services/schedule';
import { emitSessionScheduled } from '@/lib/webhooks';

export const DELETE_MISSING_CONFIRMATION = 'DELETE_MISSING_SESSIONS' as const;

export type ProgramSessionInput = {
  externalId: string;
  title: string;
  description: string | null;
  status: 'draft' | 'published' | 'cancelled';
  startsAt: string | null;
  endsAt: string | null;
  room: string | null;
  track: string | null;
  format: string | null;
  ceuCredits: string | null;
};

export type ProgramReconcileInput = {
  source: 'accelevents';
  mode: 'merge' | 'replace';
  apply: boolean;
  confirmDeleteMissing?: typeof DELETE_MISSING_CONFIRMATION;
  sessions: ProgramSessionInput[];
  deleteExternalIds: string[];
};

export type ProgramOperationAction = 'create' | 'update' | 'delete' | 'noop' | 'error';

export type ProgramOperation = {
  externalId: string;
  action: ProgramOperationAction;
  sessionId: string | null;
  changes: string[];
  message: string | null;
};

export type ProgramReconcileResult = {
  source: 'accelevents';
  mode: 'merge' | 'replace';
  applied: boolean;
  canApply: boolean;
  requiresDeleteConfirmation: boolean;
  summary: Record<ProgramOperationAction, number>;
  operations: ProgramOperation[];
};

type StoredSession = Pick<
  typeof scheduledSession.$inferSelect,
  | 'id'
  | 'clientId'
  | 'title'
  | 'descriptionMarkdown'
  | 'status'
  | 'startsAt'
  | 'endsAt'
  | 'roomId'
  | 'trackId'
  | 'formatId'
  | 'ceuCredits'
>;

type TaxonomyRow = { id: string; name: string };

export type ProgramTaxonomy = {
  rooms: TaxonomyRow[];
  tracks: TaxonomyRow[];
  formats: TaxonomyRow[];
};

type SessionValues = {
  clientId: string;
  title: string;
  descriptionMarkdown: string | null;
  status: 'draft' | 'published' | 'cancelled';
  startsAt: Date | null;
  endsAt: Date | null;
  roomId: string | null;
  trackId: string | null;
  formatId: string | null;
  ceuCredits: string | null;
};

type Mutation =
  | { action: 'create'; externalId: string; values: SessionValues }
  | {
      action: 'update';
      externalId: string;
      current: StoredSession;
      values: SessionValues;
    }
  | { action: 'delete'; externalId: string; current: StoredSession };

type ProgramPlan = ProgramReconcileResult & { mutations: Mutation[] };

function externalKey(source: ProgramReconcileInput['source'], externalId: string): string {
  return `${source}:${externalId}`;
}

function externalIdFromKey(source: ProgramReconcileInput['source'], clientId: string | null) {
  const prefix = `${source}:`;
  return clientId?.startsWith(prefix) ? clientId.slice(prefix.length) : null;
}

function taxonomyId(
  kind: 'room' | 'track' | 'format',
  reference: string | null | undefined,
  rows: TaxonomyRow[],
): { id: string | null; error?: string } {
  const value = reference?.trim();
  if (!value) return { id: null };

  const matches = rows.filter(
    (row) => row.id === value || row.name.toLocaleLowerCase() === value.toLocaleLowerCase(),
  );
  if (matches.length === 1) return { id: matches[0].id };
  if (matches.length === 0) {
    return { id: null, error: `No ${kind} named or identified by “${value}” exists` };
  }
  return { id: null, error: `More than one ${kind} matches “${value}”; use its id` };
}

function parseInstant(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

function normalizeSession(
  source: ProgramReconcileInput['source'],
  input: ProgramSessionInput,
  taxonomy: ProgramTaxonomy,
): { values?: SessionValues; error?: string } {
  const startsAt = parseInstant(input.startsAt);
  const endsAt = parseInstant(input.endsAt);
  const roomRef = taxonomyId('room', input.room, taxonomy.rooms);
  const trackRef = taxonomyId('track', input.track, taxonomy.tracks);
  const formatRef = taxonomyId('format', input.format, taxonomy.formats);
  const errors = [roomRef.error, trackRef.error, formatRef.error].filter(Boolean) as string[];

  if (startsAt && Number.isNaN(startsAt.getTime())) {
    errors.push('startsAt must be an ISO 8601 instant');
  }
  if (endsAt && Number.isNaN(endsAt.getTime())) {
    errors.push('endsAt must be an ISO 8601 instant');
  }
  if (Boolean(startsAt) !== Boolean(endsAt)) {
    errors.push('startsAt and endsAt must either both be set or both be null');
  }
  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    errors.push('endsAt must be after startsAt');
  }
  if (input.status === 'published' && (!startsAt || !endsAt || !roomRef.id)) {
    errors.push('Published sessions require startsAt, endsAt, and room');
  }
  if (errors.length > 0) return { error: errors.join('; ') };

  return {
    values: {
      clientId: externalKey(source, input.externalId.trim()),
      title: input.title.trim(),
      descriptionMarkdown: input.description?.trim() || null,
      status: input.status,
      startsAt,
      endsAt,
      roomId: roomRef.id,
      trackId: trackRef.id,
      formatId: formatRef.id,
      ceuCredits: input.ceuCredits?.trim() || null,
    },
  };
}

const COMPARED_FIELDS: Array<keyof SessionValues> = [
  'title',
  'descriptionMarkdown',
  'status',
  'startsAt',
  'endsAt',
  'roomId',
  'trackId',
  'formatId',
  'ceuCredits',
];

function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

function changedFields(current: StoredSession, values: SessionValues): string[] {
  return COMPARED_FIELDS.filter((field) => !sameValue(current[field], values[field]));
}

function operation(
  externalId: string,
  action: ProgramOperationAction,
  sessionId: string | null,
  changes: string[] = [],
  message: string | null = null,
): ProgramOperation {
  return { externalId, action, sessionId, changes, message };
}

function summarize(operations: ProgramOperation[]): Record<ProgramOperationAction, number> {
  return {
    create: operations.filter((row) => row.action === 'create').length,
    update: operations.filter((row) => row.action === 'update').length,
    delete: operations.filter((row) => row.action === 'delete').length,
    noop: operations.filter((row) => row.action === 'noop').length,
    error: operations.filter((row) => row.action === 'error').length,
  };
}

export function planProgramReconciliation(
  input: ProgramReconcileInput,
  stored: StoredSession[],
  taxonomy: ProgramTaxonomy,
): ProgramPlan {
  const operations: ProgramOperation[] = [];
  const mutations: Mutation[] = [];
  const byExternalId = new Map<string, StoredSession[]>();

  for (const current of stored) {
    const externalId = externalIdFromKey(input.source, current.clientId);
    if (!externalId) continue;
    byExternalId.set(externalId, [...(byExternalId.get(externalId) ?? []), current]);
  }

  const requestedIds = new Set<string>();
  const deleteIds = new Set(input.deleteExternalIds.map((id) => id.trim()));

  for (const candidate of input.sessions) {
    const externalId = candidate.externalId.trim();
    if (requestedIds.has(externalId)) {
      operations.push(operation(externalId, 'error', null, [], 'externalId appears more than once'));
      continue;
    }
    requestedIds.add(externalId);

    if (deleteIds.has(externalId)) {
      operations.push(
        operation(
          externalId,
          'error',
          null,
          [],
          'The same externalId cannot be upserted and deleted',
        ),
      );
      continue;
    }

    const matches = byExternalId.get(externalId) ?? [];
    if (matches.length > 1) {
      operations.push(
        operation(
          externalId,
          'error',
          null,
          [],
          'More than one existing session has this externalId; resolve the duplicate first',
        ),
      );
      continue;
    }

    const normalized = normalizeSession(input.source, candidate, taxonomy);
    if (!normalized.values) {
      operations.push(operation(externalId, 'error', matches[0]?.id ?? null, [], normalized.error));
      continue;
    }

    const current = matches[0];
    if (!current) {
      operations.push(operation(externalId, 'create', null, Object.keys(normalized.values)));
      mutations.push({ action: 'create', externalId, values: normalized.values });
      continue;
    }

    const changes = changedFields(current, normalized.values);
    if (changes.length === 0) {
      operations.push(operation(externalId, 'noop', current.id));
      continue;
    }
    operations.push(operation(externalId, 'update', current.id, changes));
    mutations.push({ action: 'update', externalId, current, values: normalized.values });
  }

  for (const externalId of deleteIds) {
    if (requestedIds.has(externalId)) continue;
    const matches = byExternalId.get(externalId) ?? [];
    if (matches.length > 1) {
      operations.push(
        operation(
          externalId,
          'error',
          null,
          [],
          'More than one existing session has this externalId; resolve the duplicate first',
        ),
      );
      continue;
    }
    const current = matches[0];
    if (!current) {
      operations.push(
        operation(externalId, 'noop', null, [], 'No managed session has this externalId'),
      );
      continue;
    }
    operations.push(operation(externalId, 'delete', current.id));
    mutations.push({ action: 'delete', externalId, current });
  }

  if (input.mode === 'replace') {
    for (const [externalId, matches] of byExternalId) {
      if (requestedIds.has(externalId) || deleteIds.has(externalId)) continue;
      if (matches.length > 1) {
        operations.push(
          operation(
            externalId,
            'error',
            null,
            [],
            'More than one existing session has this externalId; resolve the duplicate first',
          ),
        );
        continue;
      }
      operations.push(operation(externalId, 'delete', matches[0].id));
      mutations.push({ action: 'delete', externalId, current: matches[0] });
    }
  }

  const summary = summarize(operations);
  const requiresDeleteConfirmation = input.mode === 'replace' && summary.delete > 0;
  const deleteConfirmed = input.confirmDeleteMissing === DELETE_MISSING_CONFIRMATION;

  return {
    source: input.source,
    mode: input.mode,
    applied: false,
    canApply: summary.error === 0 && (!requiresDeleteConfirmation || deleteConfirmed),
    requiresDeleteConfirmation,
    summary,
    operations,
    mutations,
  };
}

type ProgramDb = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

async function loadProgramState(eventId: string, database: ProgramDb) {
  const [stored, rooms, tracks, formats] = await Promise.all([
    database.query.scheduledSession.findMany({ where: eq(scheduledSession.eventId, eventId) }),
    database.query.room.findMany({ where: eq(room.eventId, eventId) }),
    database.query.track.findMany({ where: eq(track.eventId, eventId) }),
    database.query.sessionFormat.findMany({ where: eq(sessionFormat.eventId, eventId) }),
  ]);
  return {
    stored,
    taxonomy: {
      rooms: rooms.map(({ id, name }) => ({ id, name })),
      tracks: tracks.map(({ id, name }) => ({ id, name })),
      formats: formats.map(({ id, name }) => ({ id, name })),
    },
  };
}

function publicResult(plan: ProgramPlan, applied = false): ProgramReconcileResult {
  return {
    source: plan.source,
    mode: plan.mode,
    applied,
    canApply: plan.canApply,
    requiresDeleteConfirmation: plan.requiresDeleteConfirmation,
    summary: plan.summary,
    operations: plan.operations,
  };
}

function assertProgramPlanConflictFree(plan: ProgramPlan, stored: StoredSession[]): void {
  const final = new Map(stored.map((row) => [row.id, row]));
  const changedSessionIds = new Set<string>();

  for (const mutation of plan.mutations) {
    if (mutation.action === 'create') {
      const id = `pending:${mutation.externalId}`;
      final.set(id, { id, ...mutation.values });
      changedSessionIds.add(id);
    } else if (mutation.action === 'update') {
      final.set(mutation.current.id, { ...mutation.current, ...mutation.values });
      changedSessionIds.add(mutation.current.id);
    } else {
      final.delete(mutation.current.id);
    }
  }

  const entries: ScheduleEntry[] = [...final.values()].map((row, index) => ({
    id: row.id,
    ref: index + 1,
    title: row.title,
    submissionId: null,
    roomId: row.roomId,
    trackId: row.trackId,
    formatId: row.formatId,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    status: row.status,
    ceuCredits: row.ceuCredits,
    clientId: row.clientId,
    speakers: [],
  }));
  const blocked = detectConflicts(entries).find((item) =>
    item.sessionIds.some((sessionId) => changedSessionIds.has(sessionId)),
  );
  if (blocked) throw conflict(blocked.message);
}

async function applyProgramPlan(eventId: string, plan: ProgramPlan, database: ProgramDb) {
  const notifyAfterCommit: string[] = [];

  for (const mutation of plan.mutations) {
    if (mutation.action === 'create') {
      const [created] = await database
        .insert(scheduledSession)
        .values({
          eventId,
          submissionId: null,
          ref: await allocateSessionRef(eventId, database),
          icsUid: mintIcsUid(),
          ...mutation.values,
        })
        .returning({ id: scheduledSession.id });
      const row = plan.operations.find(
        (candidate) =>
          candidate.action === 'create' && candidate.externalId === mutation.externalId,
      );
      if (row) row.sessionId = created.id;
      if (mutation.values.status === 'published') notifyAfterCommit.push(created.id);
      continue;
    }

    if (mutation.action === 'update') {
      if (mutation.current.status === 'published' && mutation.values.status !== 'published') {
        await cancelPublishedSessionBeforeMutation(eventId, mutation.current.id);
      }
      await database
        .update(scheduledSession)
        .set({ ...mutation.values, updatedAt: new Date() })
        .where(
          and(eq(scheduledSession.id, mutation.current.id), eq(scheduledSession.eventId, eventId)),
        );
      if (mutation.values.status === 'published') notifyAfterCommit.push(mutation.current.id);
      continue;
    }

    if (mutation.current.status === 'published' && mutation.current.startsAt) {
      await cancelPublishedSessionBeforeMutation(eventId, mutation.current.id);
    }
    await database
      .delete(scheduledSession)
      .where(
        and(eq(scheduledSession.id, mutation.current.id), eq(scheduledSession.eventId, eventId)),
      );
  }

  return notifyAfterCommit;
}

export async function reconcileProgram(
  eventId: string,
  input: ProgramReconcileInput,
  database: Database = getDb(),
): Promise<ProgramReconcileResult> {
  if (!input.apply) {
    const state = await loadProgramState(eventId, database);
    return publicResult(planProgramReconciliation(input, state.stored, state.taxonomy));
  }

  const outcome = await database.transaction(async (transaction) => {
    // Every agenda writer shares this event lock, so the plan and conflict decision see the state
    // committed by the previous mutation regardless of which write surface produced it.
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${eventId}, 0))`,
    );
    const state = await loadProgramState(eventId, transaction);
    const plan = planProgramReconciliation(input, state.stored, state.taxonomy);
    if (!plan.canApply) return { result: publicResult(plan), notifications: [] };
    assertProgramPlanConflictFree(plan, state.stored);
    const notifications = await applyProgramPlan(eventId, plan, transaction);
    return { result: publicResult(plan, true), notifications };
  });

  for (const sessionId of outcome.notifications) {
    await notifyIfPublished(sessionId);
  }
  if (outcome.result.applied) {
    for (const operation of outcome.result.operations) {
      if ((operation.action === 'create' || operation.action === 'update') && operation.sessionId) {
        await emitSessionScheduled(eventId, operation.sessionId);
      }
    }
  }
  return outcome.result;
}
