'use client';

import { useMemo, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import {
  Button,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  IconButton,
  Input,
} from '@/components/ui';
import type {
  Breakdown,
  Counters,
  Nudge,
  OutstandingTaskRow,
  PacingSeries,
  ReviewRoundProgress,
  ScheduleHealth,
  SpeakerRow,
  TaskCompletionSummary,
  WidgetId,
} from '@/lib/services/dashboard';
import { PREBUILT_DASHBOARDS, WIDGETS } from '@/lib/services/dashboard-catalog';
import { OutstandingTasks } from './OutstandingTasks';
import { SpeakerTrackingWidget } from './SpeakerTracking';
import {
  BreakdownWidget,
  CountersWidget,
  NudgesWidget,
  PacingWidget,
  ReportsWidget,
  ReviewProgressWidget,
  ScheduleHealthWidget,
  StatusBreakdownWidget,
} from './widgets';
import styles from './dashboard.module.css';

export type DashboardData = {
  eventName: string;
  outstanding: OutstandingTaskRow[];
  taskSummary: TaskCompletionSummary;
  counters: Counters;
  nudges: Nudge[];
  pacing: { current: PacingSeries; compare: PacingSeries | null };
  byForm: Breakdown[];
  byTrack: Breakdown[];
  reviewRounds: ReviewRoundProgress[];
  scheduleHealth: ScheduleHealth;
  speakers: SpeakerRow[];
};

export type CustomDashboard = { id: string; name: string; widgets: WidgetId[] };

const STORAGE_KEY = 'cicero-custom-dashboards';

function loadCustom(): CustomDashboard[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as CustomDashboard[];
  } catch {
    return [];
  }
}

function persist(boards: CustomDashboard[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(boards));
  } catch {
    /* A dashboard layout is not worth failing a page load over. */
  }
}

function Widget({ id, data }: { id: WidgetId; data: DashboardData }) {
  switch (id) {
    case 'counters':
      return <CountersWidget counters={data.counters} tasks={data.taskSummary} />;
    case 'nudges':
      return <NudgesWidget nudges={data.nudges} />;
    case 'outstanding':
      return (
        <Card className={styles.wide}>
          <CardHeader>
            <CardTitle>Who owes what</CardTitle>
            <CardDescription>
              Every speaker × every task assigned to them. Overdue first, then due soon, then not
              started.
            </CardDescription>
          </CardHeader>
          <CardBody>
            <OutstandingTasks rows={data.outstanding} />
          </CardBody>
        </Card>
      );
    case 'status-breakdown':
      return <StatusBreakdownWidget counters={data.counters} />;
    case 'pacing':
      return <PacingWidget current={data.pacing.current} compare={data.pacing.compare} />;
    case 'by-form':
      return <BreakdownWidget title="By form" rows={data.byForm} />;
    case 'by-track':
      return <BreakdownWidget title="By track" rows={data.byTrack} />;
    case 'review-progress':
      return <ReviewProgressWidget rounds={data.reviewRounds} />;
    case 'schedule-health':
      return <ScheduleHealthWidget health={data.scheduleHealth} />;
    case 'speaker-tracking':
      return <SpeakerTrackingWidget speakers={data.speakers} />;
    case 'reports':
      return <ReportsWidget />;
    default:
      return null;
  }
}

/**
 * `B-4` and `B-5` are the same renderer: a dashboard is a named list of widget ids. Prebuilt lists
 * are constants, custom ones live in the browser, and a widget added to the catalog shows up in
 * both without a second wiring.
 */
export function Dashboard({ data }: { data: DashboardData }) {
  const [custom, setCustom] = useState<CustomDashboard[]>(loadCustom);
  const [activeId, setActiveId] = useState(PREBUILT_DASHBOARDS[0].id);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftWidgets, setDraftWidgets] = useState<WidgetId[]>([]);

  const boards = useMemo(
    () => [
      ...PREBUILT_DASHBOARDS.map((board) => ({
        id: board.id,
        name: board.name,
        description: board.description,
        widgets: board.widgets,
        custom: false,
      })),
      ...custom.map((board) => ({
        id: board.id,
        name: board.name,
        description: 'Your dashboard.',
        widgets: board.widgets,
        custom: true,
      })),
    ],
    [custom],
  );

  const active = boards.find((board) => board.id === activeId) ?? boards[0];

  const saveDraft = () => {
    const name = draftName.trim() || 'Untitled dashboard';
    const board: CustomDashboard = {
      id: `custom-${Date.now()}`,
      name,
      widgets: draftWidgets,
    };
    const next = [...custom, board];
    setCustom(next);
    persist(next);
    setActiveId(board.id);
    setBuilderOpen(false);
    setDraftName('');
    setDraftWidgets([]);
  };

  const removeBoard = (id: string) => {
    const next = custom.filter((board) => board.id !== id);
    setCustom(next);
    persist(next);
    if (activeId === id) setActiveId(PREBUILT_DASHBOARDS[0].id);
  };

  const toggleDraftWidget = (id: WidgetId) => {
    setDraftWidgets((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Dashboard</p>
          <h1 className={styles.title}>{data.eventName}</h1>
          <p className={styles.subtitle}>
            {data.taskSummary.overdue > 0
              ? `${data.taskSummary.overdue} overdue tasks across ${data.taskSummary.blockedSpeakers} speakers.`
              : `${data.taskSummary.outstanding} tasks outstanding, none overdue.`}
          </p>
        </div>
      </div>

      <div className={styles.tabRow}>
        <div className={styles.tabs}>
          {boards.map((board) => (
            <button
              key={board.id}
              type="button"
              className={styles.tab}
              data-active={board.id === active.id}
              onClick={() => setActiveId(board.id)}
            >
              {board.name}
            </button>
          ))}
        </div>
        <div className={styles.builderBar}>
          {active.custom ? (
            <IconButton
              label={`Delete ${active.name}`}
              variant="ghost"
              size="sm"
              onClick={() => removeBoard(active.id)}
            >
              <X size={14} />
            </IconButton>
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            iconLeft={<Plus size={14} />}
            onClick={() => setBuilderOpen(true)}
          >
            New dashboard
          </Button>
        </div>
      </div>

      {active.widgets.length === 0 ? (
        <p className={styles.emptyDashboard}>This dashboard has no widgets yet.</p>
      ) : (
        <div className={styles.grid}>
          {active.widgets.map((widget) => (
            <Widget key={widget} id={widget} data={data} />
          ))}
        </div>
      )}

      <Dialog
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        title="Build a dashboard"
        description="Pick the widgets you want. It is saved in this browser."
      >
        <Input
          value={draftName}
          placeholder="Dashboard name"
          aria-label="Dashboard name"
          onChange={(e) => setDraftName(e.target.value)}
        />
        <div className={styles.widgetPicker} style={{ marginTop: 'var(--space-3)' }}>
          {WIDGETS.map((widget) => {
            const selected = draftWidgets.includes(widget.id);
            return (
              <button
                key={widget.id}
                type="button"
                className={styles.widgetOption}
                data-selected={selected}
                onClick={() => toggleDraftWidget(widget.id)}
              >
                {selected ? <Check size={14} aria-hidden /> : <Plus size={14} aria-hidden />}
                <span className={styles.widgetOptionText}>
                  <span className={styles.widgetOptionName}>{widget.name}</span>
                  <span className={styles.widgetOptionDescription}>{widget.description}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className={styles.builderBar}>
          <Button onClick={saveDraft} disabled={draftWidgets.length === 0}>
            Save dashboard
          </Button>
          <Button variant="ghost" onClick={() => setBuilderOpen(false)}>
            Cancel
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
