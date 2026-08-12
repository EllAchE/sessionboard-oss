'use client';

import Link from 'next/link';
import { ArrowRight, Download } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import type {
  Breakdown,
  Counters,
  Nudge,
  PacingSeries,
  ReviewRoundProgress,
  ScheduleHealth,
  TaskCompletionSummary,
} from '@/lib/services/dashboard';
import { REPORTS } from '@/lib/services/dashboard';
import styles from './dashboard.module.css';

export function Counter({
  value,
  label,
  hint,
  tone,
}: {
  value: number | string;
  label: string;
  hint?: string;
  tone?: 'danger' | 'warning' | 'success';
}) {
  return (
    <div className={styles.counter}>
      <span className={styles.counterValue} data-tone={tone}>
        {value}
      </span>
      <span className={styles.counterLabel}>{label}</span>
      {hint ? <span className={styles.counterHint}>{hint}</span> : null}
    </div>
  );
}

/** `B-2`. */
export function CountersWidget({
  counters,
  tasks,
}: {
  counters: Counters;
  tasks: TaskCompletionSummary;
}) {
  return (
    <Card className={styles.wide}>
      <CardHeader>
        <CardTitle>Where the event stands</CardTitle>
        <CardDescription>Live counts across submissions, speakers and onboarding.</CardDescription>
      </CardHeader>
      <CardBody>
        <div className={styles.counterGrid}>
          <Counter
            value={tasks.overdue}
            label="Overdue tasks"
            tone={tasks.overdue > 0 ? 'danger' : 'success'}
            hint={`${tasks.blockedSpeakers} speakers blocked`}
          />
          <Counter
            value={`${tasks.completionPct}%`}
            label="Task completion"
            tone={tasks.completionPct === 100 ? 'success' : undefined}
            hint={`${tasks.completed + tasks.waived} of ${tasks.assignments} settled`}
          />
          <Counter value={counters.submissions} label="Submissions" />
          <Counter value={counters.byStatus.accepted} label="Accepted" tone="success" />
          <Counter value={counters.acceptedSpeakers} label="Accepted speakers" />
          <Counter
            value={counters.sessions}
            label="Sessions"
            hint={`${counters.publishedSessions} published`}
          />
        </div>
      </CardBody>
    </Card>
  );
}

/** `B-2` status breakdown. */
export function StatusBreakdownWidget({ counters }: { counters: Counters }) {
  const entries: { label: string; value: number; tone: string }[] = [
    { label: 'Accepted', value: counters.byStatus.accepted, tone: 'accepted' },
    {
      label: 'Pending',
      value: counters.byStatus.submitted + counters.byStatus.under_review,
      tone: 'pending',
    },
    { label: 'Waitlisted', value: counters.byStatus.waitlisted, tone: 'pending' },
    { label: 'Declined', value: counters.byStatus.declined, tone: 'declined' },
    { label: 'Withdrawn', value: counters.byStatus.withdrawn, tone: 'declined' },
    { label: 'Drafts', value: counters.byStatus.draft, tone: 'drafts' },
  ];
  const max = Math.max(1, ...entries.map((entry) => entry.value));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Submission status</CardTitle>
      </CardHeader>
      <CardBody>
        <div className={styles.bars}>
          {entries.map((entry) => (
            <div key={entry.label} className={styles.barRow}>
              <span className={styles.barLabel}>{entry.label}</span>
              <span className={styles.barTrack}>
                <span
                  className={styles.barSegment}
                  data-tone={entry.tone}
                  style={{ width: `${(entry.value / max) * 100}%` }}
                />
              </span>
              <span className={styles.barValue}>{entry.value}</span>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

/** `B-3`. */
export function NudgesWidget({ nudges }: { nudges: Nudge[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Next actions</CardTitle>
        <CardDescription>Each one links straight to the fix.</CardDescription>
      </CardHeader>
      <CardBody>
        {nudges.length === 0 ? (
          <p className={styles.counterHint}>Nothing needs attention right now.</p>
        ) : (
          <div className={styles.nudgeList}>
            {nudges.map((nudge) => (
              <Link key={nudge.id} href={nudge.href} className={styles.nudge} data-tone={nudge.tone}>
                <span className={styles.nudgeCount}>{nudge.count}</span>
                <span className={styles.nudgeLabel}>{nudge.label}</span>
                <ArrowRight size={14} aria-hidden />
              </Link>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

const CHART_WIDTH = 480;
const CHART_HEIGHT = 160;

function path(series: PacingSeries, maxDay: number, maxCount: number): string {
  if (series.points.length === 0) return '';
  return series.points
    .map((point, index) => {
      const x = maxDay === 0 ? CHART_WIDTH : (point.dayIndex / maxDay) * CHART_WIDTH;
      const y = CHART_HEIGHT - (point.cumulative / maxCount) * CHART_HEIGHT;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/** `B-6`. Aligned on days-since-first-submission so two editions are comparable at all. */
export function PacingWidget({
  current,
  compare,
}: {
  current: PacingSeries;
  compare: PacingSeries | null;
}) {
  const all = compare ? [current, compare] : [current];
  const maxDay = Math.max(1, ...all.flatMap((s) => s.points.map((p) => p.dayIndex)));
  const maxCount = Math.max(1, ...all.map((s) => s.total));

  return (
    <Card className={styles.wide}>
      <CardHeader>
        <CardTitle>Submission pacing</CardTitle>
        <CardDescription>
          Cumulative arrivals by day since the first submission of each edition.
        </CardDescription>
      </CardHeader>
      <CardBody>
        {current.points.length === 0 ? (
          <p className={styles.chartEmpty}>No submissions yet.</p>
        ) : (
          <>
            <svg
              className={styles.chart}
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={`Cumulative submissions reaching ${current.total} over ${maxDay} days`}
            >
              <line
                className={styles.chartAxis}
                x1={0}
                y1={CHART_HEIGHT}
                x2={CHART_WIDTH}
                y2={CHART_HEIGHT}
              />
              {compare ? (
                <path
                  className={styles.chartLine}
                  data-series="compare"
                  d={path(compare, maxDay, maxCount)}
                />
              ) : null}
              <path
                className={styles.chartLine}
                data-series="current"
                d={path(current, maxDay, maxCount)}
              />
            </svg>
            <div className={styles.legend}>
              <span className={styles.legendItem}>
                <span className={styles.swatch} data-tone="current" />
                {current.eventName} · {current.total}
              </span>
              {compare ? (
                <span className={styles.legendItem}>
                  <span className={styles.swatch} data-tone="compare" />
                  {compare.eventName} · {compare.total}
                </span>
              ) : null}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

/** `B-7`. */
export function BreakdownWidget({ title, rows }: { title: string; rows: Breakdown[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardBody>
        {rows.length === 0 ? (
          <p className={styles.counterHint}>Nothing to break down yet.</p>
        ) : (
          <>
            <div className={styles.bars}>
              {rows.map((row) => (
                <div key={row.id} className={styles.barRow}>
                  <span className={styles.barLabel} title={row.label}>
                    {row.label}
                  </span>
                  <span className={styles.barTrack}>
                    {(['accepted', 'pending', 'declined', 'drafts'] as const).map((key) => (
                      <span
                        key={key}
                        className={styles.barSegment}
                        data-tone={key}
                        style={{ width: `${(row[key] / Math.max(row.total, 1)) * 100}%` }}
                      />
                    ))}
                  </span>
                  <span className={styles.barValue}>{row.total}</span>
                </div>
              ))}
            </div>
            <div className={styles.legend}>
              {(
                [
                  ['accepted', 'Accepted'],
                  ['pending', 'Pending'],
                  ['declined', 'Declined'],
                  ['drafts', 'Drafts'],
                ] as const
              ).map(([tone, label]) => (
                <span key={tone} className={styles.legendItem}>
                  <span className={styles.swatch} data-tone={tone} />
                  {label}
                </span>
              ))}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

export function ReviewProgressWidget({ rounds }: { rounds: ReviewRoundProgress[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Review progress</CardTitle>
      </CardHeader>
      <CardBody>
        {rounds.length === 0 ? (
          <p className={styles.counterHint}>No review rounds have been created.</p>
        ) : (
          rounds.map((round) => (
            <div key={round.id} className={styles.statRow}>
              <span className={styles.statLabel}>
                {round.name} <Badge tone="neutral">{round.status}</Badge>
              </span>
              <span className={styles.statValue}>
                {round.completed}/{round.assigned} scored · {round.reviewers} reviewers ·{' '}
                {round.completionPct}%
              </span>
            </div>
          ))
        )}
      </CardBody>
    </Card>
  );
}

export function ScheduleHealthWidget({ health }: { health: ScheduleHealth }) {
  const rows: { label: string; value: number; danger?: boolean }[] = [
    { label: 'Sessions', value: health.total },
    { label: 'Published', value: health.published },
    { label: 'Still draft', value: health.draft },
    { label: 'Without a time slot', value: health.unscheduled, danger: health.unscheduled > 0 },
    { label: 'Without a room', value: health.missingRoom, danger: health.missingRoom > 0 },
    {
      label: 'Accepted talks not on the agenda',
      value: health.acceptedWithoutSession,
      danger: health.acceptedWithoutSession > 0,
    },
    { label: 'Room clashes', value: health.conflicts.length, danger: health.conflicts.length > 0 },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schedule health</CardTitle>
      </CardHeader>
      <CardBody>
        {rows.map((row) => (
          <div key={row.label} className={styles.statRow}>
            <span className={styles.statLabel}>{row.label}</span>
            <span className={styles.statValue} data-tone={row.danger ? 'danger' : undefined}>
              {row.value}
            </span>
          </div>
        ))}
        {health.conflicts.length > 0 ? (
          <div className={styles.conflicts}>
            {health.conflicts.slice(0, 5).map((conflict) => (
              <span key={`${conflict.first}-${conflict.second}`} className={styles.conflict}>
                {conflict.roomName}: “{conflict.first}” overlaps “{conflict.second}”
              </span>
            ))}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

/** `B-8`. Each report streams from `/admin/reports/[id]` as a CSV attachment. */
export function ReportsWidget() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reports</CardTitle>
        <CardDescription>Download the current state as CSV.</CardDescription>
      </CardHeader>
      <CardBody>
        <div className={styles.reportList}>
          {REPORTS.map((report) => (
            <div key={report.id} className={styles.report}>
              <span className={styles.reportText}>
                <span className={styles.reportName}>{report.name}</span>
                <span className={styles.reportDescription}>{report.description}</span>
              </span>
              <Button
                size="sm"
                variant="secondary"
                iconLeft={<Download size={14} />}
                onClick={() => {
                  window.location.href = `/admin/reports/${report.id}`;
                }}
              >
                CSV
              </Button>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
