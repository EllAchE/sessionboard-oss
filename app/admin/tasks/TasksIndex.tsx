'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  DataTable,
  Dialog,
  IconButton,
  Select,
  useToast,
} from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import type {
  AdminTaskRow,
  OutstandingTaskRow,
  TaskCompletionSummary,
} from '@/lib/services/dashboard';
import { Counter } from '../dashboard/widgets';
import { OutstandingTasks } from '../dashboard/OutstandingTasks';
import { copyTasksAction, deleteTaskAction } from './actions';
import { TaskEditor } from './TaskEditor';
import styles from '../dashboard/dashboard.module.css';
import editor from './editor.module.css';

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

/** `S-16`. Only worth a word in the row when it is not the default one-per-person. */
const SCOPE_LABEL: Record<AdminTaskRow['scope'], string> = {
  contact: '',
  submission: 'per session',
  group: 'shared per group',
};

function formatDate(iso: string | null): string {
  if (!iso) return 'No deadline';
  // Pinned locale and zone: this renders on a UTC Worker and rehydrates in the reader's own zone.
  return new Date(iso).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
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
          {SCOPE_LABEL[row.scope] ? ` · ${SCOPE_LABEL[row.scope]}` : ''}
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
  speakers,
  forms,
  submissions,
  copyableEvents,
  canManage,
}: {
  tasks: AdminTaskRow[];
  assignments: OutstandingTaskRow[];
  summary: TaskCompletionSummary;
  speakerCount: number;
  speakers: Array<{ id: string; name: string; email: string }>;
  forms: Array<{ id: string; name: string }>;
  submissions: Array<{ id: string; ref: string; title: string; accepted: boolean }>;
  copyableEvents: Array<{ id: string; name: string }>;
  canManage: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [view, setView] = useState<'assignments' | 'tasks'>('assignments');
  const [editing, setEditing] = useState<AdminTaskRow | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [confirming, setConfirming] = useState<AdminTaskRow | null>(null);
  const [copySource, setCopySource] = useState('');

  const openNew = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const openEdit = (row: AdminTaskRow) => {
    setEditing(row);
    setEditorOpen(true);
  };

  const confirmDelete = () => {
    const row = confirming;
    if (!row) return;
    setConfirming(null);
    startTransition(async () => {
      const result = await deleteTaskAction(row.id);
      if (!result.ok) {
        toast({ title: result.message, tone: 'danger' });
        return;
      }
      toast({ title: `${row.name} deleted`, tone: 'success' });
      router.refresh();
    });
  };

  const copyFrom = () => {
    if (!copySource) return;
    startTransition(async () => {
      const result = await copyTasksAction(copySource);
      if (!result.ok) {
        toast({ title: result.message, tone: 'danger' });
        return;
      }
      setCopySource('');
      toast({ title: 'Tasks copied', tone: 'success' });
      router.refresh();
    });
  };

  const columns: Array<DataTableColumn<AdminTaskRow>> = canManage
    ? [
        ...COLUMNS,
        {
          id: 'actions',
          header: <span className={editor.visuallyHidden}>Actions</span>,
          width: 'calc(var(--control-md) * 2.4)',
          align: 'right',
          render: (row) => (
            <span className={editor.rowActions}>
              <IconButton
                label={`Edit ${row.name}`}
                size="xs"
                disabled={pending}
                onKeyDown={(event) => event.stopPropagation()}
                onClick={() => openEdit(row)}
              >
                <Pencil size={14} />
              </IconButton>
              <IconButton
                label={`Delete ${row.name}`}
                size="xs"
                variant="danger"
                disabled={pending}
                onKeyDown={(event) => event.stopPropagation()}
                onClick={() => setConfirming(row)}
              >
                <Trash2 size={14} />
              </IconButton>
            </span>
          ),
        },
      ]
    : COLUMNS;

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
        {canManage ? (
          <div className={editor.headActions}>
            {copyableEvents.length > 0 ? (
              <label className={editor.copy}>
                <span className={editor.label}>Copy tasks from</span>
                <Select
                  selectSize="sm"
                  value={copySource}
                  disabled={pending}
                  onChange={(event) => setCopySource(event.target.value)}
                >
                  <option value="">Another event…</option>
                  {copyableEvents.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </Select>
              </label>
            ) : null}
            {copySource ? (
              <Button size="sm" loading={pending} onClick={copyFrom}>
                Copy
              </Button>
            ) : null}
            <Button variant="primary" size="sm" iconLeft={<Plus size={14} />} onClick={openNew}>
              New task
            </Button>
          </div>
        ) : null}
      </div>

      <div className={styles.counterGrid}>
        <Counter
          value={summary.overdue}
          label="Overdue"
          tone={summary.overdue > 0 ? 'danger' : 'success'}
        />
        <Counter
          value={summary.awaitingAction}
          label="Awaiting me"
          tone={summary.awaitingAction > 0 ? 'danger' : 'success'}
        />
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
            <OutstandingTasks rows={assignments} initialFilter="awaiting_me" />
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
              columns={columns}
              rows={tasks}
              getRowId={(row) => row.id}
              emptyState={
                canManage
                  ? 'No tasks yet. "New task" adds the first one.'
                  : 'No tasks defined for this event yet.'
              }
            />
          </CardBody>
        </Card>
      )}

      <TaskEditor
        open={editorOpen}
        editing={editing}
        forms={forms}
        speakers={speakers}
        submissions={submissions}
        onClose={() => setEditorOpen(false)}
      />

      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => (open ? undefined : setConfirming(null))}
        title={`Delete ${confirming?.name ?? ''}?`}
        description={`Every speaker's copy of this task goes with it, including ${
          confirming ? confirming.completed + confirming.waived : 0
        } already finished.`}
        footer={
          <>
            <Button onClick={() => setConfirming(null)}>Keep it</Button>
            <Button variant="danger" onClick={confirmDelete}>
              Delete task
            </Button>
          </>
        }
      />
    </div>
  );
}
