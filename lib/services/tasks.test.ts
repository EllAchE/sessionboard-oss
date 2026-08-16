import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fileRequest,
  participant,
  participantRole,
  task,
  taskAssignment,
  user,
} from '../../db/schema';
import { isAppError, type AppError } from '../errors';
import type { EventContext } from '../context';
import { listTasksForAdmin } from './dashboard';
import {
  assertCompletable,
  createTask,
  listPortalTasks,
  reconcileStatus,
  updateTask,
} from './tasks';

/**
 * `listPortalTasks` feeds both `/portal/[eventSlug]/tasks` and `/portal/[eventSlug]/files` — they
 * cannot show two different answers for the same assignment as long as `reconcileStatus` is the only
 * thing standing between the stored `status` column and what either screen renders. The case that
 * matters here is a row `assertCompletable` would never have allowed to be written in the first
 * place (seed data, a hand edit, a migration) landing as `completed` with no file or answer behind
 * it.
 */
describe('reconcileStatus', () => {
  it('downgrades a file_upload task marked completed with no file to in_progress', () => {
    expect(reconcileStatus('file_upload', 'completed', false)).toBe('in_progress');
  });

  it('keeps a file_upload task completed when a file is actually attached', () => {
    expect(reconcileStatus('file_upload', 'completed', true)).toBe('completed');
  });

  it('downgrades a form task marked completed with no answers to in_progress', () => {
    expect(reconcileStatus('form', 'completed', false)).toBe('in_progress');
  });

  it('keeps a form task completed when answers are actually present', () => {
    expect(reconcileStatus('form', 'completed', true)).toBe('completed');
  });

  it('leaves acknowledge and link tasks alone — the status flag is their only evidence', () => {
    expect(reconcileStatus('acknowledge', 'completed', false)).toBe('completed');
    expect(reconcileStatus('link', 'completed', false)).toBe('completed');
  });

  it('leaves non-completed statuses untouched regardless of evidence', () => {
    expect(reconcileStatus('file_upload', 'in_progress', false)).toBe('in_progress');
    expect(reconcileStatus('file_upload', 'not_started', false)).toBe('not_started');
    expect(reconcileStatus('form', 'waived', false)).toBe('waived');
  });
});

/**
 * The write-path guard this whole fix leans on: if `assertCompletable` is ever loosened, the
 * inconsistency `reconcileStatus` exists to paper over can be produced through the app itself, not
 * just through data that bypassed it.
 */
describe('assertCompletable', () => {
  it('refuses to complete a file_upload task with no files', () => {
    expect(() =>
      assertCompletable({ kind: 'file_upload', fileCount: 0, answers: null, acknowledged: false }),
    ).toThrow();
  });

  it('refuses to complete a form task with no answers', () => {
    expect(() =>
      assertCompletable({ kind: 'form', fileCount: 0, answers: null, acknowledged: false }),
    ).toThrow();
  });

  it('allows a file_upload task with at least one file', () => {
    expect(() =>
      assertCompletable({ kind: 'file_upload', fileCount: 1, answers: null, acknowledged: false }),
    ).not.toThrow();
  });
});

/**
 * Covers the organizer-facing gap this file closes: there was no way to create a task type beyond
 * the five seeded ones. The two things worth protecting are that a `file_upload` task is born with
 * somewhere to put the file, and that a new task does not stay invisible until a speaker happens to
 * open their portal — `B-1` (the outstanding-tasks dashboard) is read directly from
 * `task_assignment`, so a task with zero assignment rows reads as "nothing to do" even though it
 * exists.
 *
 * The fake db below is a smaller cousin of the one in `settings.test.ts`: same chainable/awaitable
 * shape, extended so `insert` actually appends to `rec.rows` (needed here because `createTask`
 * reads the `task` table again, indirectly through `ensureAssignments`, right after inserting into
 * it) and so it understands `onConflictDoNothing`, which `ensureAssignments` chains instead of
 * `returning`.
 */

type Projection = Record<string, unknown> | undefined;

type Recorder = {
  rows: Map<unknown, unknown[]>;
  inserted: Array<{ table: unknown; values: unknown }>;
  deleted: Array<{ table: unknown; ids: string[] }>;
};

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('../../db/client', () => ({ getDb: () => state.db }));

function recorder(): Recorder {
  return { rows: new Map(), inserted: [], deleted: [] };
}

function fakeDb(rec: Recorder) {
  const parameters = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.flatMap(parameters);
    if (!value || typeof value !== 'object') return [];
    const candidate = value as { value?: unknown; queryChunks?: unknown[] };
    if (value.constructor.name === 'Param') {
      return Array.isArray(candidate.value)
        ? candidate.value.filter((entry): entry is string => typeof entry === 'string')
        : typeof candidate.value === 'string'
          ? [candidate.value]
          : [];
    }
    return candidate.queryChunks?.flatMap(parameters) ?? [];
  };

  const projected = (row: Record<string, unknown>, projection?: Projection) =>
    projection ? Object.fromEntries(Object.keys(projection).map((key) => [key, row[key]])) : row;

  const select = (projection?: Projection) => {
    let table: unknown = null;
    let filters: string[] = [];
    const builder = {
      from(next: unknown) {
        table = next;
        return builder;
      },
      where(condition: unknown) {
        filters = parameters(condition);
        return builder;
      },
      orderBy: () => builder,
      innerJoin: () => builder,
      leftJoin: () => builder,
      limit: () => builder,
      then: (onOk: (value: unknown[]) => unknown, onErr?: (reason: unknown) => unknown) =>
        Promise.resolve()
          .then(() => {
            const rows = (rec.rows.get(table) ?? []) as Array<Record<string, unknown>>;
            if (table === participant) {
              return rows
                .filter(
                  (row) =>
                    !row.eventId || filters.length === 0 || filters.includes(String(row.eventId)),
                )
                .map((row) => projected(row, projection));
            }
            if (table === task) {
              return rows
                .filter(
                  (row) =>
                    filters.length === 0 ||
                    filters.includes(String(row.id)) ||
                    filters.includes(String(row.eventId)),
                )
                .map((row) => projected(row, projection));
            }
            if (table === taskAssignment && projection && 'assignment' in projection) {
              const participantFilter = filters.find((value) =>
                ((rec.rows.get(participant) ?? []) as Array<{ id: string }>).some(
                  (row) => row.id === value,
                ),
              );
              return rows.flatMap<unknown>((assignment): unknown[] => {
                if (participantFilter && assignment.participantId !== participantFilter) return [];
                const taskRow = ((rec.rows.get(task) ?? []) as Array<Record<string, unknown>>).find(
                  (row) => row.id === assignment.taskId,
                );
                if (
                  !taskRow ||
                  (filters.length > 0 && !filters.includes(String(taskRow.eventId)))
                ) {
                  return [];
                }
                if ('participant' in projection) {
                  const participantRow = (
                    (rec.rows.get(participant) ?? []) as Array<Record<string, unknown>>
                  ).find((row) => row.id === assignment.participantId);
                  const account = (
                    (rec.rows.get(user) ?? []) as Array<Record<string, unknown>>
                  ).find((row) => row.id === participantRow?.userId);
                  return participantRow && account
                    ? [
                        {
                          assignment,
                          task: taskRow,
                          participant: participantRow,
                          account,
                        },
                      ]
                    : [];
                }
                return [{ assignment, task: taskRow, fileRequest: null, form: null }];
              });
            }
            if (table === taskAssignment) {
              return rows
                .filter((row) => filters.length === 0 || filters.includes(String(row.taskId)))
                .map((row) => projected(row, projection));
            }
            return rows.map((row) => projected(row, projection));
          })
          .then(onOk, onErr),
    };
    return builder;
  };

  const insert = (table: unknown) => {
    let storedValues: unknown;
    const commit = () => {
      const arr = Array.isArray(storedValues) ? storedValues : [storedValues];
      const created = arr.map((values, index) => ({
        id: `generated-${rec.inserted.length}-${index}`,
        ...(values as object),
      }));
      rec.rows.set(table, [...(rec.rows.get(table) ?? []), ...created]);
      return created;
    };
    const builder = {
      values(vals: unknown) {
        storedValues = vals;
        rec.inserted.push({ table, values: vals });
        return builder;
      },
      returning: () => Promise.resolve(commit()),
      onConflictDoNothing: () => Promise.resolve(commit()),
    };
    return builder;
  };

  const update = (table: unknown) => ({
    set(patch: Record<string, unknown>) {
      return {
        where(condition: unknown) {
          const ids = parameters(condition);
          const rows = (rec.rows.get(table) ?? []) as Array<Record<string, unknown>>;
          rec.rows.set(
            table,
            rows.map((row) => (ids.includes(String(row.id)) ? { ...row, ...patch } : row)),
          );
          return Promise.resolve();
        },
      };
    },
  });

  const remove = (table: unknown) => ({
    where(condition: unknown) {
      const ids = parameters(condition);
      rec.deleted.push({ table, ids });
      const rows = (rec.rows.get(table) ?? []) as Array<Record<string, unknown>>;
      rec.rows.set(
        table,
        rows.filter((row) => !ids.includes(String(row.id))),
      );
      return Promise.resolve();
    },
  });

  return {
    select,
    insert,
    update,
    delete: remove,
    query: {
      task: { findMany: () => Promise.resolve(rec.rows.get(task) ?? []) },
    },
  };
}

const EVENT_ID = 'event-1';
const PARTICIPANT_ID = 'participant-1';

function context(roles: EventContext['roles'] = ['organizer']): EventContext {
  return {
    actor: { userId: 'user-1', email: 'chair@example.test', name: 'Chair', impersonatedByUserId: null },
    eventId: EVENT_ID,
    roles,
  };
}

async function rejection(work: Promise<unknown>): Promise<AppError> {
  try {
    await work;
  } catch (error) {
    if (isAppError(error)) return error;
    throw error;
  }
  throw new Error('expected the call to be refused');
}

let rec: Recorder;

beforeEach(() => {
  rec = recorder();
  // `scope` is NOT NULL on the real table, so the fixtures carry it rather than leaving the
  // resolver to interpret a row shape the database cannot produce.
  rec.rows.set(task, [
    {
      id: 'task-old-accepted-only',
      eventId: EVENT_ID,
      audience: 'accepted_participants',
      scope: 'contact',
      submissionId: null,
      position: 0,
    },
    {
      id: 'task-old-everyone',
      eventId: EVENT_ID,
      audience: 'all_participants',
      scope: 'contact',
      submissionId: null,
      position: 1,
    },
  ]);
  rec.rows.set(participant, [{ id: PARTICIPANT_ID }]);
  rec.rows.set(taskAssignment, []);
  rec.rows.set(participantRole, []);
  rec.rows.set(user, []);
  state.db = fakeDb(rec);
});

describe('createTask', () => {
  it('is closed to a reviewer', async () => {
    const error = await rejection(
      createTask(context(['reviewer']), {
        name: 'Sign the agreement',
        kind: 'acknowledge',
        audience: 'all_participants',
      }),
    );
    expect(error.code).toBe('forbidden');
  });

  it('rejects a blank name before touching the database', async () => {
    const error = await rejection(
      createTask(context(), { name: '   ', kind: 'acknowledge', audience: 'all_participants' }),
    );
    expect(error.code).toBe('invalid');
    expect(rec.inserted).toHaveLength(0);
  });

  it('refuses a link task with no URL and a form task with no form', async () => {
    const noUrl = await rejection(
      createTask(context(), { name: 'Read the handbook', kind: 'link', audience: 'all_participants' }),
    );
    expect(noUrl.code).toBe('invalid');
    const noForm = await rejection(
      createTask(context(), { name: 'Travel details', kind: 'form', audience: 'all_participants' }),
    );
    expect(noForm.code).toBe('invalid');
    expect(rec.inserted).toHaveLength(0);
  });

  it('appends after the last position and stores a blank description as null', async () => {
    await createTask(context(), {
      name: 'Sign the code of conduct',
      descriptionMarkdown: '  ',
      kind: 'acknowledge',
      audience: 'all_participants',
    });

    const created = rec.inserted.find((entry) => entry.table === task);
    expect(created?.values).toMatchObject({
      eventId: EVENT_ID,
      name: 'Sign the code of conduct',
      descriptionMarkdown: null,
      kind: 'acknowledge',
      audience: 'all_participants',
      required: true,
      position: 2,
    });
  });

  it('gives a file_upload task an upload target named after it', async () => {
    await createTask(context(), {
      name: 'Send your badge photo',
      kind: 'file_upload',
      audience: 'accepted_participants',
      required: false,
    });

    const request = rec.inserted.find((entry) => entry.table === fileRequest);
    expect(request?.values).toMatchObject({ eventId: EVENT_ID, label: 'Send your badge photo' });
    const created = rec.inserted.find((entry) => entry.table === task);
    expect(created?.values).toMatchObject({ kind: 'file_upload', required: false });
    expect((created?.values as { fileRequestId: string }).fileRequestId).toBeTruthy();
  });

  it('drops reminder offsets that are not usable and sorts the rest furthest-out first', async () => {
    await createTask(context(), {
      name: 'Confirm your travel dates',
      kind: 'acknowledge',
      audience: 'all_participants',
      reminderDaysBefore: [1, 0, 14, Number.NaN, -3],
    });

    const created = rec.inserted.find((entry) => entry.table === task);
    expect(created?.values).toMatchObject({ reminderDaysBefore: [14, 1] });
  });

  it('keeps one positive whole-day follow-up interval after a reminder send', async () => {
    await createTask(context(), {
      name: 'Confirm your travel dates',
      kind: 'acknowledge',
      audience: 'all_participants',
      reminderDaysAfterSend: 3,
    });

    const created = rec.inserted.find((entry) => entry.table === task);
    expect(created?.values).toMatchObject({ reminderDaysAfterSend: 3 });
  });

  it.each([0, -2, 1.5, Number.NaN])(
    'disables an unusable after-send interval of %s',
    async (reminderDaysAfterSend) => {
      await createTask(context(), {
        name: 'Confirm your travel dates',
        kind: 'acknowledge',
        audience: 'all_participants',
        reminderDaysAfterSend,
      });

      const created = rec.inserted.find((entry) => entry.table === task);
      expect(created?.values).toMatchObject({ reminderDaysAfterSend: null });
    },
  );

  it('assigns the new task to every current participant it applies to, immediately', async () => {
    await createTask(context(), {
      name: 'Read the code of conduct',
      kind: 'acknowledge',
      audience: 'all_participants',
    });

    const assignments = rec.inserted
      .filter((entry) => entry.table === taskAssignment)
      .flatMap((entry) => entry.values as Array<{ taskId: string; participantId: string }>);

    // The pre-existing all_participants task and the brand-new one both get an assignment row for
    // this participant. The accepted_participants task does not, because this participant has no
    // accepted submission — the same rule `ensureAssignments` already applies on portal load.
    expect(assignments).toHaveLength(2);
    expect(assignments.every((row) => row.participantId === PARTICIPANT_ID)).toBe(true);
    const taskIds = assignments.map((row) => row.taskId);
    expect(taskIds).toContain('task-old-everyone');
    expect(taskIds).not.toContain('task-old-accepted-only');
  });
});

describe('selected-speaker assignments', () => {
  beforeEach(() => {
    rec.rows.set(task, []);
    rec.rows.set(participant, [
      {
        id: 'participant-1',
        eventId: EVENT_ID,
        userId: 'user-1',
        displayName: 'Ada Lovelace',
        company: 'Analytical Engines',
      },
      {
        id: 'participant-2',
        eventId: EVENT_ID,
        userId: 'user-2',
        displayName: 'Grace Hopper',
        company: 'Navy',
      },
      {
        id: 'participant-3',
        eventId: EVENT_ID,
        userId: 'user-3',
        displayName: 'Margaret Hamilton',
        company: 'NASA',
      },
    ]);
    rec.rows.set(user, [
      { id: 'user-1', name: 'Ada Lovelace', email: 'ada@example.test' },
      { id: 'user-2', name: 'Grace Hopper', email: 'grace@example.test' },
      {
        id: 'user-3',
        name: 'Margaret Hamilton',
        email: 'margaret@example.test',
      },
    ]);
  });

  it('assigns exactly two selected speakers and exposes the same rows to admin and portal reads', async () => {
    const created = await createTask(context(), {
      name: 'Confirm travel details',
      kind: 'acknowledge',
      audience: 'manual',
      participantIds: ['participant-1', 'participant-3'],
    });

    const assignments = (rec.rows.get(taskAssignment) ?? []) as Array<{
      participantId: string;
      taskId: string;
    }>;
    expect(assignments.map((row) => row.participantId).sort()).toEqual([
      'participant-1',
      'participant-3',
    ]);
    expect(assignments.every((row) => row.taskId === created.id)).toBe(true);

    const adminRows = await listTasksForAdmin(context());
    expect(adminRows[0]).toMatchObject({
      assigned: 2,
      participantIds: ['participant-1', 'participant-3'],
    });
    expect(await listPortalTasks(EVENT_ID, 'participant-1')).toHaveLength(1);
    expect(await listPortalTasks(EVENT_ID, 'participant-2')).toHaveLength(0);
  });

  it('reconciles edited membership while preserving an assignment that remains selected', async () => {
    const created = await createTask(context(), {
      name: 'Confirm travel details',
      kind: 'acknowledge',
      audience: 'manual',
      participantIds: ['participant-1', 'participant-2'],
    });
    const before = (rec.rows.get(taskAssignment) ?? []) as Array<Record<string, unknown>>;
    const retained = before.find((row) => row.participantId === 'participant-2');
    if (retained) retained.status = 'completed';

    await updateTask(context(), created.id, {
      name: 'Confirm travel details',
      kind: 'acknowledge',
      audience: 'manual',
      participantIds: ['participant-2', 'participant-3'],
    });

    const after = (rec.rows.get(taskAssignment) ?? []) as Array<Record<string, unknown>>;
    expect(after.map((row) => row.participantId).sort()).toEqual([
      'participant-2',
      'participant-3',
    ]);
    expect(after.find((row) => row.participantId === 'participant-2')).toMatchObject({
      id: retained?.id,
      status: 'completed',
    });
    expect(after.find((row) => row.participantId === 'participant-3')).toMatchObject({
      status: 'not_started',
    });
  });

  it('rejects a selected participant id that is outside the current event', async () => {
    const error = await rejection(
      createTask(context(), {
        name: 'Confirm travel details',
        kind: 'acknowledge',
        audience: 'manual',
        participantIds: ['participant-1', 'participant-from-another-event'],
      }),
    );

    expect(error.code).toBe('invalid');
    expect(error.message).toBe('Every selected speaker must belong to this event');
    expect(rec.inserted.some((entry) => entry.table === task)).toBe(false);
  });
});
