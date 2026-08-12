/**
 * The parts of the dashboard service a browser is allowed to have. `dashboard.ts` opens a database
 * connection at import, so a client component importing these from there drags `pg` — and with it
 * `net` and `tls` — into the bundle and the build fails.
 */

// ---------------------------------------------------------------------------
// `B-8` reports
// ---------------------------------------------------------------------------

export type ReportId =
  | 'outstanding-tasks'
  | 'task-completion'
  | 'speakers'
  | 'submissions'
  | 'review-scores';

export const REPORTS: { id: ReportId; name: string; description: string }[] = [
  {
    id: 'outstanding-tasks',
    name: 'Outstanding speaker tasks',
    description: 'One row per person per unfinished task, worst overdue first.',
  },
  {
    id: 'task-completion',
    name: 'Task completion',
    description: 'Every assignment including the finished ones, for a completion rate.',
  },
  {
    id: 'speakers',
    name: 'Speaker roster',
    description: 'Profile completeness, accepted sessions and task progress per speaker.',
  },
  {
    id: 'submissions',
    name: 'Submission pipeline',
    description: 'Every submission with its form, track, status and decision date.',
  },
  {
    id: 'review-scores',
    name: 'Review scores',
    description: 'One row per reviewer per submission: score, completion state and comment.',
  },
];

// ---------------------------------------------------------------------------
// `B-4`/`B-5` widget catalog. A prebuilt dashboard is a named widget list, and a custom one is a
// user-owned list in `saved_view` — same renderer, so a new widget appears in both at once.
// ---------------------------------------------------------------------------

export type WidgetId =
  | 'counters'
  | 'nudges'
  | 'outstanding'
  | 'status-breakdown'
  | 'pacing'
  | 'by-form'
  | 'by-track'
  | 'review-progress'
  | 'schedule-health'
  | 'speaker-tracking'
  | 'reports';

export const WIDGETS: { id: WidgetId; name: string; description: string }[] = [
  { id: 'counters', name: 'Counters', description: 'Submissions, speakers, sessions.' },
  { id: 'nudges', name: 'Next actions', description: 'What is blocking the program right now.' },
  {
    id: 'outstanding',
    name: 'Outstanding tasks',
    description: 'Who owes what, overdue first.',
  },
  {
    id: 'status-breakdown',
    name: 'Status breakdown',
    description: 'Accepted / pending / declined / drafts / withdrawn.',
  },
  { id: 'pacing', name: 'Submission pacing', description: 'Arrivals over time, with a comparison.' },
  { id: 'by-form', name: 'By form', description: 'Volume and acceptance per form.' },
  { id: 'by-track', name: 'By track', description: 'Volume and acceptance per track.' },
  { id: 'review-progress', name: 'Review progress', description: 'Scoring completion per round.' },
  {
    id: 'schedule-health',
    name: 'Schedule health',
    description: 'Unscheduled talks, missing rooms, room clashes.',
  },
  {
    id: 'speaker-tracking',
    name: 'Speaker tracking',
    description: 'Profile completeness and task progress.',
  },
  { id: 'reports', name: 'Reports', description: 'CSV exports.' },
];

export const PREBUILT_DASHBOARDS: {
  id: string;
  name: string;
  description: string;
  widgets: WidgetId[];
}[] = [
  {
    id: 'event-overview',
    name: 'Event Overview',
    description: 'The whole program in one screen.',
    widgets: ['counters', 'nudges', 'outstanding', 'status-breakdown'],
  },
  {
    id: 'submissions-pipeline',
    name: 'Submissions Pipeline',
    description: 'Where the content is coming from and how fast.',
    widgets: ['status-breakdown', 'pacing', 'by-form', 'by-track'],
  },
  {
    id: 'speaker-tracking',
    name: 'Speaker Tracking',
    description: 'Onboarding state for every confirmed speaker.',
    widgets: ['outstanding', 'speaker-tracking', 'reports'],
  },
  {
    id: 'review-progress',
    name: 'Review Progress',
    description: 'How far each scoring round has got.',
    widgets: ['review-progress', 'status-breakdown'],
  },
  {
    id: 'schedule-health',
    name: 'Schedule Health',
    description: 'Everything that would break the printed agenda.',
    widgets: ['schedule-health', 'counters', 'nudges'],
  },
];

export function isWidgetId(value: string): value is WidgetId {
  return WIDGETS.some((widget) => widget.id === value);
}
