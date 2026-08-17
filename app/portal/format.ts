import { formatMinutes, zonedDayKey, zonedMinutes } from '@/lib/services/schedule';
import type { TaskStatus } from '@/lib/services/tasks';

/**
 * Every date a speaker reads is in the event's timezone, not the browser's. A speaker flying in
 * from another continent must never be shown a deadline that is a day out from what the organizer
 * announced.
 */
function formatter(timezone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: timezone });
  } catch {
    return new Intl.DateTimeFormat('en-US', options);
  }
}

export function formatDate(value: Date | string | null | undefined, timezone: string): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(`${value}T12:00:00Z`) : value;
  if (Number.isNaN(date.getTime())) return '';
  return formatter(timezone, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

export function formatDateTime(value: Date | null | undefined, timezone: string): string {
  if (!value || Number.isNaN(value.getTime())) return '';
  return formatter(timezone, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(value);
}

export function formatTimeRange(
  startsAt: Date | null,
  endsAt: Date | null,
  timezone: string,
): string {
  if (!startsAt) return 'Time to be confirmed';
  const start = formatDateTime(startsAt, timezone);
  if (!endsAt) return start;
  const end = formatter(timezone, { hour: 'numeric', minute: '2-digit' }).format(endsAt);
  return `${start} – ${end}`;
}

export function profileGapSummary(count: number): string {
  if (count === 0) return 'Your profile is complete';
  return `${count} ${count === 1 ? 'thing' : 'things'} left`;
}

const DAY_MS = 86_400_000;

/** "Due in 3 days" beats a bare date on the one screen that has to make urgency obvious. */
export function relativeDue(dueAt: Date | null, now = new Date()): string {
  if (!dueAt) return 'No deadline';
  const days = Math.round((dueAt.getTime() - now.getTime()) / DAY_MS);
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days === -1) return '1 day overdue';
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days < 30) return `Due in ${days} days`;
  return `Due in ${Math.round(days / 7)} weeks`;
}

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent';

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Done',
  waived: 'Waived by organizers',
};

export function taskTone(status: TaskStatus, overdue: boolean): Tone {
  if (overdue) return 'danger';
  if (status === 'completed') return 'success';
  if (status === 'waived') return 'neutral';
  if (status === 'in_progress') return 'info';
  return 'warning';
}

export const SUBMISSION_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Pending review',
  under_review: 'Under review',
  accepted: 'Accepted',
  declined: 'Not selected',
  waitlisted: 'Waitlisted',
  withdrawn: 'Withdrawn',
};

export function submissionTone(status: string): Tone {
  switch (status) {
    case 'accepted':
      return 'success';
    case 'declined':
    case 'withdrawn':
      return 'neutral';
    case 'waitlisted':
      return 'warning';
    case 'under_review':
      return 'info';
    default:
      return 'info';
  }
}

export const ROLE_LABEL: Record<string, string> = {
  speaker: 'Speaker',
  co_speaker: 'Co-speaker',
  moderator: 'Moderator',
  panelist: 'Panelist',
};

/**
 * `AD-2`. A blackout window rendered back in the zone the speaker authored it in — their own wall
 * clock, not the event's. This is the one screen where the event timezone is the wrong answer: the
 * speaker typed "09:00" meaning their 09:00, and showing them the organizer's translation of it
 * would make a correctly stored window look wrong and invite them to "fix" it.
 *
 * The organizer's side of the same window is translated into the event zone by the agenda, from the
 * same stored instant. Two renderings, one instant, no conversion in between.
 */
export function formatUnavailabilityWindow(
  startsAt: Date,
  endsAt: Date,
  timezone: string,
): string {
  const startDay = zonedDayKey(startsAt, timezone);
  const startMinute = zonedMinutes(startsAt, timezone);
  const rawEndDay = zonedDayKey(endsAt, timezone);
  const rawEndMinute = zonedMinutes(endsAt, timezone);

  /**
   * A window ending at local midnight is the *end of the previous day*, not a zero-length sliver of
   * the next one. Half-open intervals make midnight the natural end of an all-day block, so without
   * this every "12 October, all day" reads back as "12 Oct 00:00 – 13 Oct 00:00".
   */
  const endsAtMidnight = rawEndMinute === 0 && rawEndDay !== startDay;
  const endDay = endsAtMidnight ? previousDayKey(rawEndDay) : rawEndDay;
  const endMinute = endsAtMidnight ? 24 * 60 : rawEndMinute;

  const sameDay = startDay === endDay;
  const wholeDays = startMinute === 0 && endMinute === 24 * 60;

  if (wholeDays && sameDay) return `All day, ${dayLabel(startDay, timezone)}`;
  if (wholeDays) return `${dayLabel(startDay, timezone)} – ${dayLabel(endDay, timezone)}, all day`;
  if (sameDay) {
    return `${dayLabel(startDay, timezone)}, ${formatMinutes(startMinute)}–${formatMinutes(endMinute)}`;
  }
  return `${dayLabel(startDay, timezone)} ${formatMinutes(startMinute)} – ${dayLabel(endDay, timezone)} ${formatMinutes(endMinute)}`;
}

function previousDayKey(dayKey: string): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day) - 86_400_000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${previous.getUTCFullYear()}-${pad(previous.getUTCMonth() + 1)}-${pad(previous.getUTCDate())}`;
}

/** Noon, so no zone can pull the label onto the day either side of the one meant. */
function dayLabel(dayKey: string, timezone: string): string {
  return formatDate(dayKey, timezone);
}
