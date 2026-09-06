'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, Download, PenLine } from 'lucide-react';
import { Avatar, Badge, Button, DataTable, Input, Select } from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import type { OutstandingTaskRow, TaskUrgency } from '@/lib/services/dashboard';
import { NudgeComposer } from './NudgeComposer';
import styles from './dashboard.module.css';

type SortKey = 'urgency' | 'person' | 'task' | 'due' | 'status';
type Direction = 'asc' | 'desc';
type TaskFilter = 'awaiting_me' | 'outstanding' | TaskUrgency | 'all';

const URGENCY_ORDER: Record<TaskUrgency, number> = {
  overdue: 0,
  due_soon: 1,
  open: 2,
  done: 3,
};

const STATUS_LABEL: Record<OutstandingTaskRow['status'], string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  waived: 'Waived',
};

const STATUS_TONE: Record<OutstandingTaskRow['status'], 'neutral' | 'info' | 'success'> = {
  not_started: 'neutral',
  in_progress: 'info',
  completed: 'success',
  waived: 'success',
};

const KIND_LABEL: Record<OutstandingTaskRow['taskKind'], string> = {
  form: 'Form',
  file_upload: 'Upload',
  acknowledge: 'Acknowledge',
  link: 'Link',
};

function formatDate(iso: string | null): string {
  if (!iso) return 'No deadline';
  // Pinned locale and zone: this renders on a UTC Worker and rehydrates in the reader's own zone.
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function lateness(row: OutstandingTaskRow): { text: string; tone: 'danger' | 'warning' | 'muted' } {
  if (row.urgency === 'done') return { text: 'Settled', tone: 'muted' };
  if (row.daysOverdue !== null) {
    const days = Math.max(row.daysOverdue, 0);
    return { text: days === 0 ? 'Due today' : `${days}d overdue`, tone: 'danger' };
  }
  if (row.daysUntilDue !== null) {
    return {
      text: row.daysUntilDue === 0 ? 'Due today' : `in ${row.daysUntilDue}d`,
      tone: row.urgency === 'due_soon' ? 'warning' : 'muted',
    };
  }
  return { text: 'No deadline', tone: 'muted' };
}

function compare(a: OutstandingTaskRow, b: OutstandingTaskRow, key: SortKey): number {
  switch (key) {
    case 'person':
      return a.participantName.localeCompare(b.participantName);
    case 'task':
      return a.taskName.localeCompare(b.taskName);
    case 'status':
      return a.status.localeCompare(b.status);
    case 'due': {
      if (!a.dueAt && !b.dueAt) return 0;
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return a.dueAt < b.dueAt ? -1 : 1;
    }
    default: {
      const rank = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency];
      if (rank !== 0) return rank;
      if (!a.dueAt && !b.dueAt) return 0;
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return a.dueAt < b.dueAt ? -1 : 1;
    }
  }
}

function downloadCsv(rows: OutstandingTaskRow[]): void {
  const header = ['Speaker', 'Email', 'Company', 'Task', 'Kind', 'Status', 'Due', 'Days overdue'];
  const body = rows.map((row) => [
    row.participantName,
    row.participantEmail,
    row.company ?? '',
    row.taskName,
    row.taskKind,
    row.status,
    row.dueAt?.slice(0, 10) ?? '',
    row.daysOverdue === null ? '' : String(row.daysOverdue),
  ]);
  const csv = [header, ...body]
    .map((line) =>
      line.map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(','),
    )
    .join('\n');

  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'outstanding-tasks.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * `B-1`. The report Sessionboard's FAQ says it does not have: every participant × every task they
 * owe, ordered so the answer to "who is blocking us" is the first row rather than a search.
 */
export function OutstandingTasks({
  rows,
  compact = false,
  initialFilter = 'outstanding',
}: {
  rows: OutstandingTaskRow[];
  compact?: boolean;
  initialFilter?: TaskFilter;
}) {
  const [query, setQuery] = useState('');
  const [urgency, setUrgency] = useState<TaskFilter>(initialFilter);
  const [taskId, setTaskId] = useState('all');
  const [acceptedOnly, setAcceptedOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('urgency');
  const [direction, setDirection] = useState<Direction>('asc');
  /** One row at a time, on purpose. Assisted chasing has no bulk blast — see `NudgeComposer`. */
  const [chasing, setChasing] = useState<OutstandingTaskRow | null>(null);

  const tasks = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of rows) seen.set(row.taskId, row.taskName);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (urgency === 'awaiting_me' && !row.awaitingAction) return false;
      if (urgency === 'outstanding' && row.urgency === 'done') return false;
      if (
        urgency !== 'awaiting_me' &&
        urgency !== 'outstanding' &&
        urgency !== 'all' &&
        row.urgency !== urgency
      )
        return false;
      if (taskId !== 'all' && row.taskId !== taskId) return false;
      if (acceptedOnly && !row.accepted) return false;
      if (!needle) return true;
      return (
        row.participantName.toLowerCase().includes(needle) ||
        row.participantEmail.toLowerCase().includes(needle) ||
        row.taskName.toLowerCase().includes(needle) ||
        (row.company ?? '').toLowerCase().includes(needle)
      );
    });
    const sorted = [...filtered].sort((a, b) => compare(a, b, sortKey));
    return direction === 'asc' ? sorted : sorted.reverse();
  }, [rows, query, urgency, taskId, acceptedOnly, sortKey, direction]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setDirection(direction === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setDirection('asc');
    }
  };

  const heading = (label: string, key: SortKey) => (
    <button
      type="button"
      className={styles.sortButton}
      onClick={() => toggleSort(key)}
      aria-label={`Sort by ${label}`}
    >
      {label}
      {sortKey === key ? (
        direction === 'asc' ? (
          <ArrowUp size={12} aria-hidden />
        ) : (
          <ArrowDown size={12} aria-hidden />
        )
      ) : null}
    </button>
  );

  const columns: Array<DataTableColumn<OutstandingTaskRow>> = [
    {
      id: 'person',
      header: heading('Speaker', 'person'),
      width: '23%',
      space: 'wide',
      render: (row) => (
        <div className={styles.person}>
          <Avatar name={row.participantName} size="sm" />
          <span className={styles.personText}>
            <span className={styles.personName}>{row.participantName}</span>
            <span className={styles.personMeta}>{row.company ?? row.participantEmail}</span>
          </span>
        </div>
      ),
    },
    {
      id: 'task',
      header: heading('Task', 'task'),
      width: '23%',
      space: 'wide',
      render: (row) => (
        <div className={styles.taskCell}>
          <span className={styles.taskName}>{row.taskName}</span>
          <span className={styles.personMeta}>
            {KIND_LABEL[row.taskKind]}
            {row.required ? ' · required' : ' · optional'}
          </span>
        </div>
      ),
    },
    {
      id: 'status',
      header: heading('Status', 'status'),
      width: '10%',
      space: 'compact',
      truncate: false,
      render: (row) => <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>,
    },
    {
      id: 'due',
      header: heading('Deadline', 'due'),
      width: '13%',
      render: (row) => {
        const late = lateness(row);
        return (
          <span className={styles.due}>
            <span className={styles.dueDate}>{formatDate(row.dueAt)}</span>
            <span className={styles.lateness} data-tone={late.tone}>
              {late.text}
            </span>
          </span>
        );
      },
    },
    {
      id: 'sessions',
      header: 'Sessions',
      width: '18%',
      space: 'wide',
      render: (row) =>
        row.sessionTitles.length === 0 ? (
          <span className={styles.personMeta}>{row.accepted ? '—' : 'Not accepted'}</span>
        ) : (
          <span className={styles.personMeta}>{row.sessionTitles.join(', ')}</span>
        ),
    },
    {
      /**
       * The chase, which is where the organizer's time actually goes. It drafts; it does not send.
       * Settled rows get no button — nothing is more corrosive to trust in a reminder tool than
       * chasing someone for something they already did.
       */
      id: 'chase',
      header: 'Chase',
      width: '13%',
      space: 'wide',
      truncate: false,
      render: (row) =>
        row.urgency === 'done' ? (
          <span className={styles.personMeta}>—</span>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            iconLeft={<PenLine size={14} />}
            onClick={() => setChasing(row)}
          >
            Draft a nudge
          </Button>
        ),
    },
  ];

  return (
    <div>
      <div className={styles.toolbar}>
        <Input
          inputSize="sm"
          value={query}
          placeholder="Search speaker, company or task…"
          aria-label="Filter outstanding tasks"
          onChange={(e) => setQuery(e.target.value)}
        />
        <Select
          selectSize="sm"
          value={urgency}
          aria-label="Filter by urgency"
          onChange={(e) => setUrgency(e.target.value as typeof urgency)}
        >
          <option value="awaiting_me">Awaiting me</option>
          <option value="outstanding">Outstanding</option>
          <option value="overdue">Overdue only</option>
          <option value="due_soon">Due within a week</option>
          <option value="open">No deadline pressure</option>
          <option value="done">Completed or waived</option>
          <option value="all">Everything</option>
        </Select>
        <Select
          selectSize="sm"
          value={taskId}
          aria-label="Filter by task"
          onChange={(e) => setTaskId(e.target.value)}
        >
          <option value="all">All tasks</option>
          {tasks.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
        <Button
          size="sm"
          variant={acceptedOnly ? 'primary' : 'secondary'}
          onClick={() => setAcceptedOnly(!acceptedOnly)}
        >
          Accepted speakers
        </Button>
        <span className={styles.toolbarSpacer} />
        <span className={styles.filterLabel}>{visible.length} rows</span>
        <Button
          size="sm"
          variant="ghost"
          iconLeft={<Download size={14} />}
          onClick={() => downloadCsv(visible)}
        >
          CSV
        </Button>
      </div>
      <DataTable
        label="Outstanding speaker tasks"
        columns={columns}
        rows={compact ? visible.slice(0, 10) : visible}
        getRowId={(row) => row.id}
        emptyState={
          urgency === 'awaiting_me'
            ? 'Nothing is awaiting your follow-up.'
            : 'All assigned tasks are complete.'
        }
      />
      {compact && visible.length > 10 ? (
        <p className={styles.counterHint}>
          Showing 10 of {visible.length}. <Link href="/organizer/tasks">See every task</Link>.
        </p>
      ) : null}
      <NudgeComposer row={chasing} onClose={() => setChasing(null)} />
    </div>
  );
}
