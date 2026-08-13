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
  if (!startsAt) return 'Hour awaiting proclamation';
  const start = formatDateTime(startsAt, timezone);
  if (!endsAt) return start;
  const end = formatter(timezone, { hour: 'numeric', minute: '2-digit' }).format(endsAt);
  return `${start} – ${end}`;
}

const DAY_MS = 86_400_000;

/** "Due in 3 days" beats a bare date on the one screen that has to make urgency obvious. */
export function relativeDue(dueAt: Date | null, now = new Date()): string {
  if (!dueAt) return 'No appointed day';
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
  not_started: 'Not begun',
  in_progress: 'In hand',
  completed: 'Fulfilled',
  waived: 'Waived by magistrates',
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
  submitted: 'Before the council',
  under_review: 'Under deliberation',
  accepted: 'Proclaimed',
  declined: 'Declined',
  waitlisted: 'Held in reserve',
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
  speaker: 'Orator',
  co_speaker: 'Fellow orator',
  moderator: 'Moderator',
  panelist: 'Panelist',
};
