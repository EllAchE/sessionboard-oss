import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fileRequest, participant, participantRole, task, taskAssignment } from '../../db/schema';
import { isAppError, type AppError } from '../errors';
import type { EventContext } from '../context';
import { assertCompletable, createTask, reconcileStatus } from './tasks';

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
