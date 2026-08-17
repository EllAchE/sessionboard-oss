/**
 * The notification categories, and nothing else.
 *
 * These live apart from `lib/services/notification-preferences.ts` because that module imports
 * `getDb`, and the two surfaces that let a person switch a category off — the organizer's settings
 * panel and the speaker's profile form — are both client components. Importing the service into
 * either would drag the database client into the browser bundle, so before this file existed both
 * of them kept their own copy of the list inline.
 *
 * Two copies of a list is two chances to forget one. Adding the `deadline` category for the
 * milestone reminders (`AR-51`) updated the service and neither UI, so the mails were sendable and
 * unswitchable-off — the preference resolved correctly on the server, but no toggle existed to set
 * it. Both surfaces now render this list, so a category added here appears in both or in neither.
 */

export const NOTIFICATION_CATEGORIES = [
  'submission',
  'session',
  'task',
  'form',
  'deadline',
  'adhoc',
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/**
 * Ordered as the UIs read them: what a speaker hears about their own work first, the dates that
 * pace the edition next, and the organizer's own announcements last.
 */
export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  submission: 'Submission updates',
  session: 'Schedule changes',
  task: 'Task reminders',
  form: 'Submission deadlines',
  deadline: 'Event milestones',
  adhoc: 'Organizer announcements',
};

/** `[key, label]` in display order, for the two panels that render a row per category. */
export const NOTIFICATION_CATEGORY_ROWS: readonly (readonly [NotificationCategory, string])[] =
  NOTIFICATION_CATEGORIES.map((key) => [key, NOTIFICATION_CATEGORY_LABELS[key]] as const);

/**
 * A template key's category is its prefix. An unrecognised prefix falls back to `adhoc` — silently,
 * which is why `comms.test.ts` pins that every shipped template's prefix is a real category.
 */
export function notificationCategory(templateKey: string | null | undefined): NotificationCategory {
  const prefix = (templateKey ?? 'adhoc').split('.')[0];
  return (NOTIFICATION_CATEGORIES as readonly string[]).includes(prefix)
    ? (prefix as NotificationCategory)
    : 'adhoc';
}
