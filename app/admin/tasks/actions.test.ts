import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventContext, MembershipRole } from '@/lib/context';
import { conflict } from '@/lib/errors';
import type { TaskFormInput } from './actions';

/**
 * The organizer's task writes. The rules about what a task may be live in the service, so these
 * tests cover what this file alone owns: the capability gate, the string-to-service parsing the
 * panel cannot do, and the error translation.
 *
 * `requireCapability` is deliberately left real — mocking it would make the gate test vacuous.
 */

const currentEventContext = vi.fn<() => Promise<EventContext>>();
const revalidatePath = vi.fn();
const service = {
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  copyTasksFromEvent: vi.fn(),
};

vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock('@/lib/services/events', () => ({ currentEventContext: () => currentEventContext() }));
vi.mock('@/lib/services/tasks', () => ({
  createTask: (...a: unknown[]) => service.createTask(...a),
  updateTask: (...a: unknown[]) => service.updateTask(...a),
  deleteTask: (...a: unknown[]) => service.deleteTask(...a),
  copyTasksFromEvent: (...a: unknown[]) => service.copyTasksFromEvent(...a),
}));

const actions = await import('./actions');

const ctxWith = (...roles: MembershipRole[]): EventContext => ({
  actor: {
    userId: 'user-organizer',
    email: 'organizer@forum.example',
    name: 'Organizer',
    impersonatedByUserId: null,
  },
  eventId: 'event-forum',
  roles,
});

const input = (over: Partial<TaskFormInput> = {}): TaskFormInput => ({
  name: 'Send your slides',
  descriptionMarkdown: '',
  kind: 'file' as TaskFormInput['kind'],
  audience: 'accepted' as TaskFormInput['audience'],
  // `S-16`: contact scope is the default; the submission-scoped variants name a session.
  scope: 'contact' as TaskFormInput['scope'],
  submissionId: '',
  participantIds: [],
  dueAt: '',
  required: true,
  linkUrl: '',
  formId: '',
  reminderDaysBefore: '',
  ...over,
});

const sentInput = () => service.createTask.mock.calls[0][1];

beforeEach(() => {
  // `reset`, not `clear`: clearing keeps implementations, so a rejection set in one test would
  // still be pending in the next one and quietly weaken it.
  vi.resetAllMocks();
  currentEventContext.mockResolvedValue(ctxWith('organizer'));
});

describe('the capability gate', () => {
  it('lets an organizer through and refreshes the task board', async () => {
    expect(await actions.createTaskAction(input())).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith('/admin/tasks');
  });

  it('refuses a reviewer, who may read the event but not set duties', async () => {
    currentEventContext.mockResolvedValue(ctxWith('reviewer'));

    const result = await actions.createTaskAction(input());

    expect(result).toEqual({ ok: false, message: 'This action needs the task:manage permission' });
    expect(service.createTask).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('deadline parsing', () => {
  it('puts a bare date at the end of its own day, locally', async () => {
    // A `YYYY-MM-DD` parsed as UTC midnight renders as the day before west of Greenwich, and a
    // deadline is owed by the end of its day. Asserted through local getters so the test does not
    // depend on the machine's zone.
    await actions.createTaskAction(input({ dueAt: '2026-08-20' }));

    const due = sentInput().dueAt as Date;
    expect(due.getFullYear()).toBe(2026);
    expect(due.getMonth()).toBe(7);
    expect(due.getDate()).toBe(20);
    expect(due.getHours()).toBe(23);
    expect(due.getMinutes()).toBe(59);
  });

  it('reads no deadline from an empty or blank field', async () => {
    await actions.createTaskAction(input({ dueAt: '   ' }));

    expect(sentInput().dueAt).toBeNull();
  });

  it('still accepts a full timestamp', async () => {
    await actions.createTaskAction(input({ dueAt: '2026-08-20T09:30:00.000Z' }));

    expect((sentInput().dueAt as Date).toISOString()).toBe('2026-08-20T09:30:00.000Z');
  });

  it('treats an unparseable deadline as none rather than an invalid date', async () => {
    await actions.createTaskAction(input({ dueAt: 'the ides of March' }));

    expect(sentInput().dueAt).toBeNull();
  });
});

describe('reminder cadence parsing', () => {
  it('keeps the positive whole days and discards the rest', async () => {
    await actions.createTaskAction(input({ reminderDaysBefore: '7, 3 ,0, -2, soon, 1' }));

    expect(sentInput().reminderDaysBefore).toEqual([7, 3, 1]);
  });

  it('reads no cadence from an empty field', async () => {
    await actions.createTaskAction(input({ reminderDaysBefore: '' }));

    expect(sentInput().reminderDaysBefore).toEqual([]);
  });
});

describe('form linkage', () => {
  it('sends an unchosen form as null rather than an empty string', async () => {
    await actions.createTaskAction(input({ formId: '' }));

    expect(sentInput().formId).toBeNull();
  });

  it('passes a chosen form through', async () => {
    await actions.createTaskAction(input({ formId: 'form-headshot' }));

    expect(sentInput().formId).toBe('form-headshot');
  });
});

describe('error translation', () => {
  it('surfaces a service refusal in its own words', async () => {
    service.deleteTask.mockRejectedValue(conflict('Speakers have already answered this duty'));

    expect(await actions.deleteTaskAction('task-1')).toEqual({
      ok: false,
      message: 'Speakers have already answered this duty',
    });
  });

  it('hides an unexpected failure behind a generic message', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    service.copyTasksFromEvent.mockRejectedValue(new Error('connection terminated'));

    expect(await actions.copyTasksAction('event-last-year')).toEqual({
      ok: false,
      message: 'Something went wrong. Try again.',
    });
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe('routing to the service', () => {
  it('passes the task id alongside the parsed input on update', async () => {
    await actions.updateTaskAction('task-1', input({ name: 'Send your slides' }));

    expect(service.updateTask.mock.calls[0][1]).toBe('task-1');
    expect(service.updateTask.mock.calls[0][2].name).toBe('Send your slides');
  });

  it('copies from the named source event', async () => {
    await actions.copyTasksAction('event-last-year');

    expect(service.copyTasksFromEvent).toHaveBeenCalledWith(expect.anything(), 'event-last-year');
  });
});
