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
    name: 'Outstanding orator duties',
    description: 'One line per orator per unfinished duty, the gravest delay first.',
  },
  {
    id: 'task-completion',
    name: 'Duty completion',
    description: 'The full ledger of duties, settled and unsettled, with a completion rate.',
  },
  {
    id: 'speakers',
    name: 'Roll of orators',
    description: 'Portraits, accepted orations, and duty progress for every orator.',
  },
  {
    id: 'submissions',
    name: 'Petition ledger',
    description: 'Every petition with its scroll, theme, standing, and verdict date.',
  },
  {
    id: 'review-scores',
    name: 'Council scores',
    description: 'One line per councillor per petition: score, state, and written judgment.',
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
  { id: 'counters', name: 'Forum census', description: 'Petitions, orators, and orations.' },
  { id: 'nudges', name: 'Next commands', description: 'What obstructs the programme right now.' },
  {
    id: 'outstanding',
    name: 'Unsettled duties',
    description: 'Who owes what to the Forum, overdue first.',
  },
  {
    id: 'status-breakdown',
    name: 'Verdict ledger',
    description: 'Accepted / pending / declined / draft / withdrawn.',
  },
  { id: 'pacing', name: 'Petition pace', description: 'Arrivals at the Forum over time, with a comparison.' },
  { id: 'by-form', name: 'By scroll', description: 'Petitions and verdicts per scroll.' },
  { id: 'by-track', name: 'By theme', description: 'Petitions and verdicts per theme.' },
  { id: 'review-progress', name: 'Council progress', description: 'Scoring completion per deliberation.' },
  {
    id: 'schedule-health',
    name: 'Fasti health',
    description: 'Unscheduled orations, missing rooms, and public clashes.',
  },
  {
    id: 'speaker-tracking',
    name: 'Orator readiness',
    description: 'Profile completeness and duty progress.',
  },
  { id: 'reports', name: 'State tablets', description: 'CSV exports from the imperial record.' },
];

export const PREBUILT_DASHBOARDS: {
  id: string;
  name: string;
  description: string;
  widgets: WidgetId[];
}[] = [
  {
    id: 'event-overview',
    name: 'The Forum',
    description: 'The whole programme on one imperial tablet.',
    widgets: ['counters', 'nudges', 'outstanding', 'status-breakdown'],
  },
  {
    id: 'submissions-pipeline',
    name: 'Petition Ledger',
    description: 'Where every proposal came from and how quickly the rolls fill.',
    widgets: ['status-breakdown', 'pacing', 'by-form', 'by-track'],
  },
  {
    id: 'speaker-tracking',
    name: 'Orator Census',
    description: 'Readiness of every confirmed orator.',
    widgets: ['outstanding', 'speaker-tracking', 'reports'],
  },
  {
    id: 'review-progress',
    name: 'Council Progress',
    description: 'How far each round of deliberation has advanced.',
    widgets: ['review-progress', 'status-breakdown'],
  },
  {
    id: 'schedule-health',
    name: 'Fasti Health',
    description: 'Everything that would dishonour the published calendar.',
    widgets: ['schedule-health', 'counters', 'nudges'],
  },
];

export function isWidgetId(value: string): value is WidgetId {
  return WIDGETS.some((widget) => widget.id === value);
}
