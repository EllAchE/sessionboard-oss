import { beforeEach, describe, expect, it, vi } from 'vitest';
import { participant, participantRole, task, taskAssignment } from '../../db/schema';
import { isAppError, type AppError } from '../errors';
import type { EventContext } from '../context';
import { CUSTOM_TASK_AUDIENCES, createTask, createTaskInput } from './tasks';

/**
 * Covers the organizer-facing gap this file closes: there was no way to create a task type beyond
 * the five seeded ones. The two things worth protecting are that `createTask` derives the right
 * `kind` from the "does this need a file back?" toggle, and that it does not leave the new task
 * invisible until a speaker happens to open their portal — `B-1` (the outstanding-tasks dashboard)
 * is read directly from `task_assignment`, so a task with zero assignment rows reads as "nothing to
 * do" even though it exists.
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
};

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('../../db/client', () => ({ getDb: () => state.db }));

function recorder(): Recorder {
  return { rows: new Map(), inserted: [] };
}

function fakeDb(rec: Recorder) {
  const select = (projection?: Projection) => {
    let table: unknown = null;
    const builder = {
      from(next: unknown) {
        table = next;
        return builder;
      },
      where: () => builder,
      orderBy: () => builder,
      innerJoin: () => builder,
      leftJoin: () => builder,
      then: (onOk: (value: unknown[]) => unknown, onErr?: (reason: unknown) => unknown) =>
        Promise.resolve(rec.rows.get(table) ?? []).then(onOk, onErr),
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

  return { select, insert };
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
  rec.rows.set(task, [
    { id: 'task-old-accepted-only', eventId: EVENT_ID, audience: 'accepted_participants', position: 0 },
    { id: 'task-old-everyone', eventId: EVENT_ID, audience: 'all_participants', position: 1 },
  ]);
  rec.rows.set(participant, [{ id: PARTICIPANT_ID }]);
  rec.rows.set(taskAssignment, []);
  rec.rows.set(participantRole, []);
  state.db = fakeDb(rec);
});

describe('createTaskInput', () => {
  it('requires a name', () => {
    expect(createTaskInput.safeParse({ audience: 'all_participants' }).success).toBe(false);
  });

  it('offers only the audiences that are actually deliverable today', () => {
    expect(CUSTOM_TASK_AUDIENCES).toEqual(['all_participants', 'accepted_participants']);
    expect(createTaskInput.safeParse({ name: 'X', audience: 'manual' }).success).toBe(false);
  });

  it('defaults requiresFile to false and required to true', () => {
    const parsed = createTaskInput.parse({ name: 'X', audience: 'all_participants' });
    expect(parsed.requiresFile).toBe(false);
    expect(parsed.required).toBe(true);
  });
});

describe('createTask', () => {
  it('is closed to a reviewer', async () => {
    const error = await rejection(
      createTask(context(['reviewer']), { name: 'Sign the agreement', audience: 'all_participants' }),
    );
    expect(error.code).toBe('forbidden');
  });

  it('rejects a blank name before touching the database', async () => {
    const error = await rejection(createTask(context(), { name: '   ', audience: 'all_participants' }));
    expect(error.code).toBe('invalid');
    expect(rec.inserted).toHaveLength(0);
  });

  it('is a plain confirmation by default, appended after the last position', async () => {
    await createTask(context(), {
      name: 'Sign the code of conduct',
      description: '  ',
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

  it('becomes a file_upload task when requiresFile is set', async () => {
    await createTask(context(), {
      name: 'Send your badge photo',
      requiresFile: true,
      audience: 'accepted_participants',
      required: false,
    });

    const created = rec.inserted.find((entry) => entry.table === task);
    expect(created?.values).toMatchObject({ kind: 'file_upload', required: false });
  });

  it('assigns the new task to every current participant it applies to, immediately', async () => {
    await createTask(context(), { name: 'Read the code of conduct', audience: 'all_participants' });

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
