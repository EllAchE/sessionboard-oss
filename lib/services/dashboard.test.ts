import { describe, expect, it } from 'vitest';
import { summarizeTaskCompletion } from './dashboard';
import type { OutstandingTaskRow, TaskUrgency } from './dashboard';

function row(
  participantId: string,
  urgency: TaskUrgency,
  status: OutstandingTaskRow['status'] = 'not_started',
): OutstandingTaskRow {
  return {
    id: `${participantId}-${urgency}-${status}`,
    participantId,
    participantName: participantId,
    participantEmail: `${participantId}@example.test`,
    company: null,
    accepted: true,
    sessionTitles: [],
    taskId: 'task-1',
    taskName: 'Headshot',
    taskKind: 'file_upload',
    required: true,
    status,
    dueAt: null,
    daysOverdue: null,
    daysUntilDue: null,
    urgency,
    lastRemindedAt: null,
  };
}

describe('summarizeTaskCompletion', () => {
  it('counts only participants who are actually overdue', () => {
    // The regression: `overdueParticipants` used to count anyone with an *outstanding* task, so
    // this fixture reported 3 people beside a headline of 1 overdue task.
    const summary = summarizeTaskCompletion([
      row('ana', 'overdue'),
      row('ben', 'due_soon'),
      row('cleo', 'open'),
    ]);

    expect(summary.overdue).toBe(1);
    expect(summary.overdueParticipants).toBe(1);
    expect(summary.outstanding).toBe(3);
  });

  it('counts one participant once however many tasks they are late on', () => {
    const summary = summarizeTaskCompletion([
      row('ana', 'overdue'),
      { ...row('ana', 'overdue'), id: 'ana-overdue-2', taskId: 'task-2' },
      row('ben', 'overdue'),
    ]);

    expect(summary.overdue).toBe(3);
    expect(summary.overdueParticipants).toBe(2);
  });

  it('reports nobody overdue when every outstanding task is still in time', () => {
    const summary = summarizeTaskCompletion([row('ana', 'due_soon'), row('ben', 'open')]);

    expect(summary.overdue).toBe(0);
    expect(summary.overdueParticipants).toBe(0);
    expect(summary.outstanding).toBe(2);
  });

  it('settles completed and waived rows into the completion rate', () => {
    const summary = summarizeTaskCompletion([
      row('ana', 'done', 'completed'),
      row('ben', 'done', 'waived'),
      row('cleo', 'overdue'),
      row('dee', 'open'),
    ]);

    expect(summary.completed).toBe(1);
    expect(summary.waived).toBe(1);
    expect(summary.assignments).toBe(4);
    expect(summary.completionPct).toBe(50);
    expect(summary.overdueParticipants).toBe(1);
  });

  it('has no completion rate to report when there are no assignments', () => {
    const summary = summarizeTaskCompletion([]);

    expect(summary.assignments).toBe(0);
    expect(summary.completionPct).toBe(0);
    expect(summary.overdueParticipants).toBe(0);
  });
});
