import { beforeEach, describe, expect, it, vi } from 'vitest';

type TaskFixture = {
  id: string;
  eventId: string;
  name: string;
  dueAt: Date | null;
};

const state = vi.hoisted(() => ({
  eventId: 'event-one',
  taskRows: [] as TaskFixture[],
  taskScopeChecks: [] as string[],
  sentMail: [] as Array<{
    to: string;
    subject: string;
    text: string;
    eventId?: string | null;
  }>,
}));

vi.mock('../../db/client', () => ({ getDb: () => createDb() }));
vi.mock('../mail', () => ({
  sendMail: async (input: (typeof state.sentMail)[number]) => {
    state.sentMail.push(input);
    return { id: `mail-${state.sentMail.length}`, sent: true };
  },
}));

import {
  event as eventTable,
  participant,
  participantRole,
  portalTheme,
  room,
  scheduledSession,
  sessionFormat,
  taskAssignment,
  track,
} from '../../db/schema';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { previewCampaign, resolveRecipients, sendCampaign } from './comms';

const EVENTS = {
  'event-one': {
    id: 'event-one',
    name: 'First Settlement',
    slug: 'first-settlement',
    timezone: 'UTC',
    venueName: null,
    websiteUrl: null,
    startsOn: '2026-09-14',
    endsOn: '2026-09-16',
  },
  'event-two': {
    id: 'event-two',
    name: 'Second Settlement',
    slug: 'second-settlement',
    timezone: 'UTC',
    venueName: null,
    websiteUrl: null,
    startsOn: '2026-10-01',
    endsOn: '2026-10-02',
  },
} as const;

const PEOPLE = {
  'event-one': [
    {
      participantId: 'participant-one',
      userId: 'user-one',
      email: 'one@example.test',
      userName: 'One Speaker',
      displayName: 'One Speaker',
      company: null,
      jobTitle: null,
      pronouns: null,
    },
    {
      participantId: 'participant-two',
      userId: 'user-two',
      email: 'two@example.test',
      userName: 'Two Speaker',
      displayName: 'Two Speaker',
      company: null,
      jobTitle: null,
      pronouns: null,
    },
  ],
  'event-two': [
    {
      participantId: 'participant-other-event',
      userId: 'user-other-event',
      email: 'other@example.test',
      userName: 'Other Speaker',
      displayName: 'Other Speaker',
      company: null,
      jobTitle: null,
      pronouns: null,
    },
  ],
} as const;

const SUBMISSIONS = {
  'event-one': PEOPLE['event-one'].map((person, index) => ({
    participantId: person.participantId,
    id: `submission-${index + 1}`,
    ref: index + 1,
    title: `Submission ${index + 1}`,
    status: 'accepted',
    trackId: null,
    formatId: null,
    decisionNote: null,
    isPrimary: true,
  })),
  'event-two': [
    {
      participantId: 'participant-other-event',
      id: 'submission-other-event',
      ref: 1,
      title: 'Other submission',
      status: 'accepted',
      trackId: null,
      formatId: null,
      decisionNote: null,
      isPrimary: true,
    },
  ],
} as const;

const ASSIGNMENTS = {
  'event-one': [
    { participantId: 'participant-one', taskId: 'task-selected' },
    { participantId: 'participant-two', taskId: 'task-selected' },
  ],
  'event-two': [{ participantId: 'participant-other-event', taskId: 'task-other-event' }],
} as const;

function queryForSource(rowsBySource: Map<unknown, unknown[]>) {
  let result: unknown[] = [];
  let source: unknown;
  const query = {
    from: (nextSource: unknown) => {
      source = nextSource;
      result = rowsBySource.get(source) ?? [];
      return query;
    },
    innerJoin: () => query,
    where: (condition: SQL) => {
      if (source === taskAssignment) {
        const rendered = new PgDialect().sqlToQuery(condition);
        if (!rendered.sql.includes('"task"."event_id" =')) {
          throw new Error('task recipient query is missing its event scope');
        }
        state.taskScopeChecks.push(String(rendered.params[0]));
      }
      return query;
    },
    orderBy: () => query,
    limit: () => query,
    then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

function createDb() {
  const eventId = state.eventId as keyof typeof EVENTS;
  const taskById = new Map(state.taskRows.map((entry) => [entry.id, entry]));
  const taskRows = ASSIGNMENTS[eventId]
    .map((assignment) => {
      const selectedTask = taskById.get(assignment.taskId);
      return selectedTask
        ? {
            participantId: assignment.participantId,
            taskId: selectedTask.id,
            name: selectedTask.name,
            dueAt: selectedTask.dueAt,
          }
        : null;
    })
    .filter((row) => row !== null);
  const rowsBySource = new Map<unknown, unknown[]>([
    [eventTable, [EVENTS[eventId]]],
    [portalTheme, []],
    [participant, [...PEOPLE[eventId]]],
    [participantRole, [...SUBMISSIONS[eventId]]],
    [scheduledSession, []],
    [taskAssignment, taskRows],
    [track, []],
    [room, []],
    [sessionFormat, []],
  ]);

  return { select: () => queryForSource(rowsBySource) };
}

describe('bulk task reminder merge data', () => {
  beforeEach(() => {
    state.eventId = 'event-one';
    state.taskScopeChecks = [];
    state.sentMail = [];
    state.taskRows = [
      {
        id: 'task-selected',
        eventId: 'event-one',
        name: 'Upload headshot',
        dueAt: new Date('2026-09-12T23:59:00Z'),
      },
      {
        id: 'task-other-event',
        eventId: 'event-two',
        name: 'Private task from another event',
        dueAt: new Date('2026-10-01T23:59:00Z'),
      },
    ];
  });

  it('renders the selected task tokens into mail for every recipient', async () => {
    const outcome = await sendCampaign({
      eventId: 'event-one',
      subject: 'Reminder: {{task.name}}{{task.dueAt}}',
      bodyMarkdown: 'Hi {{speaker.firstName}}, complete {{task.name}}{{task.dueAt}}.',
      audience: { kind: 'outstanding_tasks', taskId: 'task-selected' },
    });

    expect(outcome).toMatchObject({ recipients: 2, sent: 2, failed: 0 });
    expect(state.sentMail).toEqual([
      expect.objectContaining({
        to: 'one@example.test',
        subject: 'Reminder: Upload headshot and due 12 September 2026',
        text: 'Hi One, complete Upload headshot and due 12 September 2026.',
        eventId: 'event-one',
      }),
      expect.objectContaining({
        to: 'two@example.test',
        subject: 'Reminder: Upload headshot and due 12 September 2026',
        text: 'Hi Two, complete Upload headshot and due 12 September 2026.',
        eventId: 'event-one',
      }),
    ]);
  });

  it('renders a selected task with no due date without leaving a due-date fragment', async () => {
    state.taskRows[0] = { ...state.taskRows[0], dueAt: null };

    const preview = await previewCampaign({
      eventId: 'event-one',
      subject: '{{task.name}}{{task.dueAt}}',
      bodyMarkdown: 'Complete {{task.name}}{{task.dueAt}}.',
      audience: { kind: 'outstanding_tasks', taskId: 'task-selected' },
    });

    expect(preview.message?.subject).toBe('Upload headshot');
    expect(preview.message?.text).toBe('Complete Upload headshot.');
    expect(preview.message?.missing).toEqual(['task.dueAt']);
  });

  it('keeps selected task data scoped to the requested event', async () => {
    const firstEventRecipients = await resolveRecipients('event-one', {
      kind: 'outstanding_tasks',
      taskId: 'task-other-event',
    });

    expect(firstEventRecipients).toEqual([]);

    state.eventId = 'event-two';
    const otherEventRecipients = await resolveRecipients('event-two', {
      kind: 'outstanding_tasks',
      taskId: 'task-other-event',
    });

    expect(otherEventRecipients).toHaveLength(1);
    expect(otherEventRecipients[0].vars).toMatchObject({
      'event.name': 'Second Settlement',
      'task.name': 'Private task from another event',
      'task.dueAt': ' and due 1 October 2026',
    });
    expect(state.taskScopeChecks).toEqual(['event-one', 'event-two']);
  });
});
