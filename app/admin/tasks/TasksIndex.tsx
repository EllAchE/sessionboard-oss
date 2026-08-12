'use client';

import { useState } from 'react';
import { Badge, Card, CardBody, CardHeader, CardTitle, DataTable } from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import type {
  AdminTaskRow,
  OutstandingTaskRow,
  TaskCompletionSummary,
} from '@/lib/services/dashboard';
import { Counter } from '../dashboard/widgets';
import { OutstandingTasks } from '../dashboard/OutstandingTasks';
import { NewTaskDialog } from './NewTaskDialog';
import styles from '../dashboard/dashboard.module.css';

const KIND_LABEL: Record<AdminTaskRow['kind'], string> = {
  form: 'Form',
  file_upload: 'File upload',
  acknowledge: 'Acknowledgement',
  link: 'External link',
};

const AUDIENCE_LABEL: Record<AdminTaskRow['audience'], string> = {
  all_participants: 'All participants',
  accepted_participants: 'Accepted speakers',
  manual: 'Manually assigned',
};

function formatDate(iso: string | null): string {
  if (!iso) return 'No deadline';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const COLUMNS: Array<DataTableColumn<AdminTaskRow>> = [
  {
    id: 'name',
    header: 'Task',
    width: '30%',
    render: (row) => (
      <div className={styles.taskCell}>
        <span className={styles.taskName}>{row.name}</span>
        <span className={styles.personMeta}>
          {KIND_LABEL[row.kind]} · {AUDIENCE_LABEL[row.audience]}
          {row.required ? ' · required' : ''}
        </span>
      </div>
    ),
  },
  {
    id: 'due',
    header: 'Deadline',
    width: '14%',
    render: (row) => <span className={styles.dueDate}>{formatDate(row.dueAt)}</span>,
  },
  {
    id: 'progress',
    header: 'Progress',
    width: '26%',
    render: (row) => (
      <span className={styles.barTrack} title={`${row.completionPct}% complete`}>
        <span
          className={styles.barSegment}
          data-tone="accepted"
          style={{ width: `${row.completionPct}%` }}
        />
      </span>
    ),
  },
  {
    id: 'counts',
    header: 'Assigned',
    width: '18%',
    render: (row) => (
      <span className={styles.personMeta}>
        {row.completed + row.waived}/{row.assigned} done · {row.inProgress} in progress
      </span>
    ),
  },
  {
    id: 'overdue',
    header: 'Overdue',
    align: 'right',
    width: '12%',
    render: (row) =>
      row.overdue > 0 ? <Badge tone="danger">{row.overdue}</Badge> : <span aria-hidden>—</span>,
  },
];

export function TasksIndex({
  tasks,
  assignments,
  summary,
  speakerCount,
  canManage,
}: {
  tasks: AdminTaskRow[];
  assignments: OutstandingTaskRow[];
  summary: TaskCompletionSummary;
  speakerCount: number;
  canManage: boolean;
}) {
  const [view, setView] = useState<'assignments' | 'tasks'>('assignments');

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Collect</p>
          <h1 className={styles.title}>Tasks</h1>
          <p className={styles.subtitle}>
            {tasks.length} tasks across {speakerCount} participants.
          </p>
        </div>
        {canManage && <NewTaskDialog />}
      </div>

      <div className={styles.counterGrid}>
        <Counter
          value={summary.overdue}
          label="Overdue"
          tone={summary.overdue > 0 ? 'danger' : 'success'}
        />
        <Counter value={summary.dueSoon} label="Due within a week" tone="warning" />
        <Counter value={summary.outstanding} label="Outstanding" />
        <Counter value={`${summary.completionPct}%`} label="Completion" />
      </div>

      <div className={styles.tabRow}>
        <div className={styles.tabs}>
          <button
            type="button"
            className={styles.tab}
            data-active={view === 'assignments'}
            onClick={() => setView('assignments')}
          >
            By person
          </button>
          <button
            type="button"
            className={styles.tab}
            data-active={view === 'tasks'}
            onClick={() => setView('tasks')}
          >
            By task
          </button>
        </div>
      </div>

      {view === 'assignments' ? (
        <Card>
          <CardHeader>
            <CardTitle>Who owes what</CardTitle>
          </CardHeader>
          <CardBody>
            <OutstandingTasks rows={assignments} />
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Tasks</CardTitle>
          </CardHeader>
          <CardBody>
            <DataTable
              label="Tasks"
              columns={COLUMNS}
              rows={tasks}
              getRowId={(row) => row.id}
              emptyState="No tasks defined for this event yet."
            />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
