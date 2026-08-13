'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MessageSquare, Send } from 'lucide-react';
import {
  Badge,
  Button,
  DataTable,
  Input,
  Select,
  useToast,
  type DataTableColumn,
} from '../../../../../components/ui';
import type { DeliverableState, DeliverableSummary } from '../../../../../lib/services/content';
import { chaseDeliverablesAction } from '../actions';
import { FilesNav } from '../FilesNav';
import queue from '../../submissions.module.css';
import styles from '../files.module.css';

export type DeliverableWire = {
  assignmentId: string;
  speakerName: string;
  speakerEmail: string;
  taskName: string;
  required: boolean;
  state: DeliverableState;
  overdue: boolean;
  dueAt: string | null;
  submissionId: string | null;
  submissionRef: string | null;
  submissionTitle: string | null;
  accepts: string;
  maxSizeMb: number | null;
  lastRemindedAt: string | null;
  files: Array<{
    id: string;
    filename: string;
    version: number;
    versionCount: number;
    commentCount: number;
  }>;
};

const STATE_LABEL: Record<DeliverableState, string> = {
  submitted: 'Submitted',
  outstanding: 'Outstanding',
  waived: 'Waived',
};

const STATE_TONE: Record<DeliverableState, 'success' | 'warning' | 'neutral'> = {
  submitted: 'success',
  outstanding: 'warning',
  waived: 'neutral',
};

function formatDay(iso: string | null): string {
  if (!iso) return '—';
  // Pinned locale and zone: this renders on a UTC Worker and rehydrates in the reader's own zone.
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** `CNT-03`. Filter to outstanding, select the rows, send the chase — three clicks, one screen. */
export function DeliverablesBoard({
  rows,
  summary,
}: {
  rows: DeliverableWire[];
  summary: DeliverableSummary;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [state, setState] = useState<string>('');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pending, start] = useTransition();

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (state && row.state !== state) return false;
      if (!needle) return true;
      return [row.speakerName, row.speakerEmail, row.taskName, row.submissionTitle]
        .filter(Boolean)
        .some((value) => (value as string).toLowerCase().includes(needle));
    });
  }, [rows, state, search]);

  const chaseable = useMemo(
    () =>
      selectedIds.filter((id) => rows.find((row) => row.assignmentId === id)?.state === 'outstanding'),
    [selectedIds, rows],
  );

  const chase = () => {
    start(async () => {
      const result = await chaseDeliverablesAction(chaseable);
      if (!result.ok) {
        toast({ title: 'Nothing sent', description: result.message, tone: 'danger' });
        return;
      }
      setSelectedIds([]);
      toast({
        title: `Chased ${result.data.sent} speaker${result.data.sent === 1 ? '' : 's'}`,
        description:
          result.data.skipped.length > 0
            ? `Skipped ${result.data.skipped.length}: ${result.data.skipped.join(', ')}`
            : 'Every reminder is in the mail log.',
        tone: 'success',
      });
      router.refresh();
    });
  };

  const columns = useMemo<Array<DataTableColumn<DeliverableWire>>>(
    () => [
      {
        id: 'speaker',
        header: 'Speaker',
        width: '22%',
        strong: true,
        render: (row) => (
          <span className={styles.owner}>
            <span>{row.speakerName}</span>
            <span className={queue.muted}>{row.speakerEmail}</span>
          </span>
        ),
      },
      {
        id: 'deliverable',
        header: 'Deliverable',
        width: '22%',
        render: (row) => (
          <span className={styles.owner}>
            <span>{row.taskName}</span>
            <span className={queue.muted}>
              {row.accepts}
              {row.maxSizeMb ? ` · up to ${row.maxSizeMb} MB` : ''}
              {row.required ? '' : ' · optional'}
            </span>
          </span>
        ),
      },
      {
        id: 'state',
        header: 'Status',
        width: '124px',
        render: (row) => (
          <Badge tone={row.overdue && row.state === 'outstanding' ? 'danger' : STATE_TONE[row.state]}>
            {row.overdue && row.state === 'outstanding' ? 'Overdue' : STATE_LABEL[row.state]}
          </Badge>
        ),
      },
      {
        id: 'files',
        header: 'Received',
        width: '22%',
        render: (row) =>
          row.files.length === 0 ? (
            <span className={queue.muted}>Nothing yet</span>
          ) : (
            <span className={styles.owner}>
              {row.files.map((entry) => (
                <Link
                  key={entry.id}
                  className={styles.fileLink}
                  href={`/admin/submissions/files/detail/${entry.id}`}
                >
                  {entry.filename}
                  {entry.versionCount > 1 ? ` · v${entry.version}` : ''}
                  {entry.commentCount > 0 ? (
                    <>
                      {' '}
                      <MessageSquare size={12} aria-hidden /> {entry.commentCount}
                    </>
                  ) : null}
                </Link>
              ))}
            </span>
          ),
      },
      {
        id: 'session',
        header: 'Session',
        width: '18%',
        render: (row) =>
          row.submissionId ? (
            <Link className={styles.fileLink} href={`/admin/submissions/${row.submissionId}`}>
              <span className={styles.ref}>{row.submissionRef}</span> {row.submissionTitle}
            </Link>
          ) : (
            <span className={queue.muted}>—</span>
          ),
      },
      {
        id: 'due',
        header: 'Due',
        width: '112px',
        mono: true,
        render: (row) => formatDay(row.dueAt),
      },
      {
        id: 'reminded',
        header: 'Chased',
        width: '112px',
        mono: true,
        render: (row) =>
          row.lastRemindedAt ? (
            formatDay(row.lastRemindedAt)
          ) : (
            <span className={queue.muted}>Never</span>
          ),
      },
    ],
    [],
  );

  return (
    <div className={queue.page}>
      <FilesNav />

      <header className={queue.header}>
        <div className={queue.headings}>
          <span className={queue.eyebrow}>Content</span>
          <h1 className={queue.title}>Deliverables</h1>
          <p className={queue.subtitle}>
            What each speaker still owes, and who to chase for it.
          </p>
        </div>
        <div className={queue.actions}>
          <Button
            variant="primary"
            iconLeft={<Send size={14} />}
            disabled={pending || chaseable.length === 0}
            onClick={chase}
          >
            {pending
              ? 'Sending…'
              : `Chase ${chaseable.length > 0 ? chaseable.length : ''} missing`.trim()}
          </Button>
        </div>
      </header>

      <div className={styles.summaryRow}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryValue}>{summary.submitted}</div>
          <div className={styles.summaryLabel}>Submitted</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryValue}>{summary.outstanding}</div>
          <div className={styles.summaryLabel}>Outstanding</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryValue}>{summary.overdue}</div>
          <div className={styles.summaryLabel}>Overdue</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryValue}>{summary.speakersMissing}</div>
          <div className={styles.summaryLabel}>Speakers to chase</div>
        </div>
      </div>

      <div className={queue.filters}>
        <Input
          className={queue.search}
          inputSize="sm"
          placeholder="Speaker, deliverable or session"
          aria-label="Search deliverables"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select
          selectSize="sm"
          aria-label="Filter by status"
          value={state}
          onChange={(event) => setState(event.target.value)}
        >
          <option value="">Any status</option>
          <option value="outstanding">Outstanding</option>
          <option value="submitted">Submitted</option>
          <option value="waived">Waived</option>
        </Select>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            setSelectedIds(
              visible.filter((row) => row.state === 'outstanding').map((row) => row.assignmentId),
            )
          }
          disabled={visible.every((row) => row.state !== 'outstanding')}
        >
          Select everything outstanding
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setSelectedIds([])}
          disabled={selectedIds.length === 0}
        >
          Clear
        </Button>
      </div>

      <div className={queue.tableWrap}>
        <DataTable
          columns={columns}
          rows={visible}
          getRowId={(row) => row.assignmentId}
          selectionMode="multiple"
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          label="Deliverable status"
          emptyState={
            rows.length === 0
              ? 'No file has been requested from any speaker yet.'
              : 'No deliverable matches these filters.'
          }
        />
      </div>
    </div>
  );
}
