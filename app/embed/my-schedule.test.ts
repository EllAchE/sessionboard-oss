import { describe, expect, it } from 'vitest';
import { parseSchedule, scheduleStorageKey, starActionLabel, toggleEntry } from './my-schedule';

describe('personal schedule store', () => {
  it('keys the store per event so two events on one browser stay separate', () => {
    expect(scheduleStorageKey('scaling-qa')).toBe('cicero-my-schedule:scaling-qa');
    expect(scheduleStorageKey('scaling-qa')).not.toBe(scheduleStorageKey('scaling-qa-2027'));
  });

  it('reads a stored selection back', () => {
    expect(parseSchedule('["session-1","session-2"]')).toEqual(['session-1', 'session-2']);
  });

  it('treats a missing, corrupt or non-array store as an empty schedule', () => {
    expect(parseSchedule(null)).toEqual([]);
    expect(parseSchedule('')).toEqual([]);
    expect(parseSchedule('{ not json')).toEqual([]);
    expect(parseSchedule('{"session-1":true}')).toEqual([]);
  });

  it('drops non-string entries rather than rendering an undefined star', () => {
    expect(parseSchedule('["session-1",7,null,"session-2"]')).toEqual(['session-1', 'session-2']);
  });

  it('toggles an id in and out without disturbing the rest', () => {
    const first = toggleEntry(['session-1'], 'session-2');
    expect(first).toEqual(['session-1', 'session-2']);
    expect(toggleEntry(first, 'session-1')).toEqual(['session-2']);
  });

  it('leaves the input untouched, so React sees a new array on every change', () => {
    const current = ['session-1'];
    const next = toggleEntry(current, 'session-2');
    expect(current).toEqual(['session-1']);
    expect(next).not.toBe(current);
  });

  it('names the star action after the session, which is all the grid control shows', () => {
    expect(starActionLabel('Testing at scale', false)).toBe('Add Testing at scale to my schedule');
    expect(starActionLabel('Testing at scale', true)).toBe(
      'Remove Testing at scale from my schedule',
    );
  });
});
