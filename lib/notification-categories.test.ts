import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_LABELS,
  NOTIFICATION_CATEGORY_ROWS,
  notificationCategory,
} from './notification-categories';

/**
 * This module exists because the list used to be written out three times — once in the service, and
 * once inline in each of the two client components that render a toggle per category. Adding
 * `deadline` for the milestone reminders (`AR-51`) updated the service and neither UI, so the mails
 * were sendable and had no switch. These cover the properties that made the drift invisible.
 */
describe('notification categories', () => {
  it('gives every category a row, in the order the panels read them', () => {
    expect(NOTIFICATION_CATEGORY_ROWS.map(([key]) => key)).toEqual([...NOTIFICATION_CATEGORIES]);
  });

  it('labels every category', () => {
    for (const key of NOTIFICATION_CATEGORIES) {
      expect({ key, label: NOTIFICATION_CATEGORY_LABELS[key]?.trim() || null }).toEqual({
        key,
        label: NOTIFICATION_CATEGORY_LABELS[key],
      });
    }
  });

  /**
   * Two categories sharing a label would render as two identical switches, which is worse than
   * missing one: the person cannot tell which is which.
   */
  it('gives no two categories the same label', () => {
    const labels = NOTIFICATION_CATEGORIES.map((key) => NOTIFICATION_CATEGORY_LABELS[key]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('reads a template key as its prefix', () => {
    expect(notificationCategory('deadline.speakers')).toBe('deadline');
    expect(notificationCategory('submission.accepted')).toBe('submission');
  });

  /** The fallback is silent, so it is pinned rather than left to be discovered. */
  it('falls back to adhoc for a prefix it does not know', () => {
    expect(notificationCategory('newthing.launched')).toBe('adhoc');
    expect(notificationCategory(null)).toBe('adhoc');
    expect(notificationCategory('')).toBe('adhoc');
  });
});
