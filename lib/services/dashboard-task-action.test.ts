import { describe, expect, it } from 'vitest';
import type { TaskActionState } from './dashboard';
import { isAwaitingTaskAction } from './dashboard';

const NOW = new Date('2026-08-16T16:00:00Z');
const DUE = new Date('2026-08-15T23:59:00Z');

function state(overrides: Partial<TaskActionState> = {}): TaskActionState {
  return {
    status: 'not_started',
    dueAt: DUE,
    lastRemindedAt: null,
    ...overrides,
  };
}

describe('isAwaitingTaskAction', () => {
  it('flags unfinished work after its deadline', () => {
    expect(isAwaitingTaskAction(state(), NOW)).toBe(true);
    expect(isAwaitingTaskAction(state({ status: 'in_progress' }), NOW)).toBe(true);
  });

  it('does not badge work that is settled or not due yet', () => {
    expect(isAwaitingTaskAction(state({ status: 'completed' }), NOW)).toBe(false);
    expect(isAwaitingTaskAction(state({ status: 'waived' }), NOW)).toBe(false);
    expect(isAwaitingTaskAction(state({ dueAt: null }), NOW)).toBe(false);
    expect(
      isAwaitingTaskAction(state({ dueAt: new Date('2026-08-17T23:59:00Z') }), NOW),
    ).toBe(false);
  });

  it('clears after a post-deadline reminder but not a scheduled pre-deadline reminder', () => {
    expect(
      isAwaitingTaskAction(
        state({ lastRemindedAt: new Date('2026-08-14T09:00:00Z') }),
        NOW,
      ),
    ).toBe(true);
    expect(
      isAwaitingTaskAction(
        state({ lastRemindedAt: new Date('2026-08-16T09:00:00Z') }),
        NOW,
      ),
    ).toBe(false);
  });
});
