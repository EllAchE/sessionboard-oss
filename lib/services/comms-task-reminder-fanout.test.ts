import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

/**
 * `S-16` gave one task several assignment rows for the same person — a `submission`-scoped task is
 * owed once per accepted session. `C-7`'s reminder run walked those rows, so a speaker with three
 * accepted talks got three emails on the same morning; and because every variable in
 * `task.reminder` is a fact about the person rather than about the assignment, the three were
 * identical, with nothing in any of them naming the session it was about.
 *
 * These pin both halves of the fix: one email per person per task, and that email naming every
 * session still outstanding.
 */

type TaskFixture = {
  id: string;
  eventId: string;
  name: string;
  dueAt: Date | null;
  reminderDaysBefore: number[];
};

type AssignmentFixture = {
  id: string;
  taskId: string;
  participantId: string;
  submissionId: string | null;
  lastRemindedAt: Date | null;
};

const state = vi.hoisted(() => ({
  tasks: [] as Array<Record<string, unknown>>,
  assignments: [] as Array<Record<string, unknown>>,
  stamped: [] as string[][],
  sentMail: [] as Array<{ to: string; subject: string; text: string }>,
}));

vi.mock('../../db/client', () => ({ getDb: () => createDb() }));
vi.mock('../mail', () => ({
  sendMail: async (input: (typeof state.sentMail)[number]) => {
    state.sentMail.push(input);
    return { id: `mail-${state.sentMail.length}`, sent: true };
  },
}));
vi.mock('../sms', () => ({
  sendSms: async () => ({ id: 'sms-1', sent: true }),
}));

import {
  emailTemplate,
  event as eventTable,
  participant,
  participantRole,
  portalTheme,
  room,
  scheduledSession,
  sessionFormat,
  task,
  taskAssignment,
  track,
} from '../../db/schema';
import { runTaskReminders } from './comms';

const EVENT = {
  id: 'event-one',
  name: 'First Settlement',
  slug: 'first-settlement',
  timezone: 'UTC',
  venueName: null,
  websiteUrl: null,
  startsOn: '2026-09-14',
  endsOn: '2026-09-16',
};

const PEOPLE = [
  {
    participantId: 'participant-one',
    userId: 'user-one',
    email: 'marcus@example.test',
    userName: 'Marcus Tullius',
    userFirstName: 'Marcus',
    displayName: 'Marcus Tullius',
    company: null,
    jobTitle: null,
    pronouns: null,
    phone: null,
    notifyEmail: true,
    notifySms: false,
  },
  {
    participantId: 'participant-two',
    userId: 'user-two',
    email: 'atticus@example.test',
    userName: 'Titus Atticus',
    userFirstName: 'Titus',
    displayName: 'Titus Atticus',
    company: null,
    jobTitle: null,
    pronouns: null,
    phone: null,
    notifyEmail: true,
    notifySms: false,
  },
];

const SUBMISSIONS = [
  {
    participantId: 'participant-one',
    id: 'submission-rhetoric',
    ref: 1,
    title: 'Rhetoric for engineers',
    status: 'accepted',
    trackId: null,
    formatId: null,
    decisionNote: null,
    isPrimary: true,
  },
  {
    participantId: 'participant-one',
    id: 'submission-invention',
    ref: 2,
    title: 'On invention',
    status: 'accepted',
    trackId: null,
    formatId: null,
    decisionNote: null,
    isPrimary: true,
  },
  {
    participantId: 'participant-one',
    id: 'submission-orator',
    ref: 3,
    title: 'The ideal orator',
    status: 'accepted',
    trackId: null,
    formatId: null,
    decisionNote: null,
    isPrimary: true,
  },
  {
    participantId: 'participant-two',
    id: 'submission-friendship',
    ref: 4,
    title: 'On friendship',
    status: 'accepted',
    trackId: null,
    formatId: null,
    decisionNote: null,
    isPrimary: true,
  },
];

/** The graph's shape: one row per assignment, joined to its task, with the session it is about. */
function graphTaskRows() {
  const byId = new Map(state.tasks.map((row) => [row.id as string, row]));
  return state.assignments.map((assignment) => {
    const owner = byId.get(assignment.taskId as string)!;
    return {
      participantId: assignment.participantId,
      taskId: owner.id,
      name: owner.name,
      dueAt: owner.dueAt,
      submissionId: assignment.submissionId,
    };
  });
}

function rowsFor(source: unknown, joined: boolean): unknown[] {
  if (source === eventTable) return [EVENT];
  if (source === portalTheme) return [];
  if (source === emailTemplate) return [];
  if (source === participant) return PEOPLE;
  if (source === participantRole) return SUBMISSIONS;
  if (source === scheduledSession) return [];
  if (source === track || source === room || source === sessionFormat) return [];
  if (source === task) return state.tasks;
  // Two queries read `task_assignment`: the recipient graph joins it to `task`, the reminder run
  // reads the bare rows it is about to stamp.
  if (source === taskAssignment) return joined ? graphTaskRows() : state.assignments;
  return [];
}

function query() {
  let source: unknown;
  let joined = false;
  const q: Record<string, unknown> = {
    from: (next: unknown) => {
      source = next;
      return q;
    },
    innerJoin: () => {
      joined = true;
      return q;
    },
    leftJoin: () => {
      joined = true;
      return q;
    },
    where: () => q,
    orderBy: () => q,
    limit: () => q,
    then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(rowsFor(source, joined)).then(resolve, reject),
  };
  return q;
}

/** The ids an `inArray(...)` stamp covered, read back off the rendered statement. */
function stampedIds(condition: SQL): string[] {
  return new PgDialect().sqlToQuery(condition).params.map(String).filter((param) => param !== 'id');
}

function createDb() {
  return {
    select: () => query(),
    insert: () => ({ values: async () => undefined }),
    update: () => ({
      set: () => ({
        where: async (condition: SQL) => {
          state.stamped.push(stampedIds(condition));
        },
      }),
    }),
  };
}

const DUE = new Date('2026-09-12T23:59:00Z');
const NOW = new Date('2026-09-12T09:00:00Z');

function submissionScopedTask(): TaskFixture {
  return {
    id: 'task-slides',
    eventId: 'event-one',
    name: 'Upload your slides',
    dueAt: DUE,
    reminderDaysBefore: [1],
  };
}

function assignment(over: Partial<AssignmentFixture> & { id: string }): AssignmentFixture {
  return {
    taskId: 'task-slides',
    participantId: 'participant-one',
    submissionId: null,
    lastRemindedAt: null,
    ...over,
  };
}

beforeEach(() => {
  state.tasks = [];
  state.assignments = [];
  state.stamped = [];
  state.sentMail = [];
});

describe('a submission-scoped reminder, for a speaker with three accepted talks', () => {
  beforeEach(() => {
    state.tasks = [submissionScopedTask()];
    state.assignments = [
      assignment({ id: 'assignment-rhetoric', submissionId: 'submission-rhetoric' }),
      assignment({ id: 'assignment-invention', submissionId: 'submission-invention' }),
      assignment({ id: 'assignment-orator', submissionId: 'submission-orator' }),
    ];
  });

  it('sends one email, not one per session', async () => {
    const sent = await runTaskReminders({ eventId: 'event-one', now: NOW });

    expect(sent).toBe(1);
    expect(state.sentMail).toHaveLength(1);
    expect(state.sentMail[0].to).toBe('marcus@example.test');
  });

  it('names every session the task is still outstanding on', async () => {
    await runTaskReminders({ eventId: 'event-one', now: NOW });

    const { text } = state.sentMail[0];
    expect(text).toContain('It applies to:');
    expect(text).toContain('Rhetoric for engineers');
    expect(text).toContain('On invention');
    expect(text).toContain('The ideal orator');
  });

  it('stamps every row the one email covered, so the next run does not re-send the rest', async () => {
    await runTaskReminders({ eventId: 'event-one', now: NOW });

    expect(state.stamped).toHaveLength(1);
    expect(state.stamped[0].sort()).toEqual([
      'assignment-invention',
      'assignment-orator',
      'assignment-rhetoric',
    ]);
  });

  it('still sends nothing on a second run inside the same offset', async () => {
    await runTaskReminders({ eventId: 'event-one', now: NOW });
    state.assignments = state.assignments.map((row) => ({ ...row, lastRemindedAt: NOW }));
    state.sentMail = [];

    const sent = await runTaskReminders({ eventId: 'event-one', now: NOW });

    expect(sent).toBe(0);
    expect(state.sentMail).toEqual([]);
  });

  it('reminds a second speaker separately — coalescing is per person, not per task', async () => {
    state.assignments.push(
      assignment({
        id: 'assignment-friendship',
        participantId: 'participant-two',
        submissionId: 'submission-friendship',
      }),
    );

    const sent = await runTaskReminders({ eventId: 'event-one', now: NOW });

    expect(sent).toBe(2);
    expect(state.sentMail.map((mail) => mail.to).sort()).toEqual([
      'atticus@example.test',
      'marcus@example.test',
    ]);
    expect(state.sentMail.find((mail) => mail.to === 'atticus@example.test')?.text).toContain(
      'On friendship',
    );
    expect(state.sentMail.find((mail) => mail.to === 'atticus@example.test')?.text).not.toContain(
      'Rhetoric for engineers',
    );
  });

  /**
   * `{{tasks.list}}` is one line per assignment too. Without the session on it the reader gets the
   * same sentence three times over and no way to tell which slides are still missing.
   */
  it('names the session on every line of the outstanding-tasks list', async () => {
    await runTaskReminders({ eventId: 'event-one', now: NOW });

    const lines = state.sentMail[0].text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('Upload your slides'));

    expect(lines).toHaveLength(3);
    expect(lines.every((line) => line.startsWith('Upload your slides ('))).toBe(true);
    expect(new Set(lines).size).toBe(3);
  });
});

describe('a contact-scoped reminder', () => {
  it('reads exactly as it did before, with no session clause bolted on', async () => {
    state.tasks = [{ ...submissionScopedTask(), id: 'task-bio', name: 'Send your bio' }];
    state.assignments = [assignment({ id: 'assignment-bio', taskId: 'task-bio' })];

    const sent = await runTaskReminders({ eventId: 'event-one', now: NOW });

    expect(sent).toBe(1);
    expect(state.sentMail[0].text).toContain('Send your bio');
    expect(state.sentMail[0].text).not.toContain('It applies to:');
    expect(state.stamped[0]).toEqual(['assignment-bio']);
  });
});

describe('the cadence itself', () => {
  it('sends nothing before the first offset has passed', async () => {
    state.tasks = [{ ...submissionScopedTask(), reminderDaysBefore: [7] }];
    state.assignments = [
      assignment({ id: 'assignment-rhetoric', submissionId: 'submission-rhetoric' }),
    ];

    const sent = await runTaskReminders({
      eventId: 'event-one',
      now: new Date('2026-09-01T09:00:00Z'),
    });

    expect(sent).toBe(0);
    expect(state.stamped).toEqual([]);
  });

  it('sends again at the next offset, for the rows still outstanding', async () => {
    state.tasks = [{ ...submissionScopedTask(), reminderDaysBefore: [7, 1] }];
    state.assignments = [
      assignment({
        id: 'assignment-rhetoric',
        submissionId: 'submission-rhetoric',
        lastRemindedAt: new Date('2026-09-05T09:00:00Z'),
      }),
    ];

    const sent = await runTaskReminders({ eventId: 'event-one', now: NOW });

    expect(sent).toBe(1);
    expect(state.stamped[0]).toEqual(['assignment-rhetoric']);
  });
});
