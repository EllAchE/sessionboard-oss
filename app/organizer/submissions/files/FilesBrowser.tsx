'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronLeft, Database, Download, FileDown, MessageSquare } from 'lucide-react';
import {
  Badge,
  Button,
  DataTable,
  Input,
  Select,
  useToast,
  type DataTableColumn,
} from '../../../../components/ui';
import { formatBytes } from '../../../../lib/services/file-format';
import { postgresStoragePressure, type StorageUsage } from '../../../../lib/storage/status';
import { checkArchiveBudget } from './archive';
import { FilesNav } from './FilesNav';
import { FILE_KINDS, fileKindLabel, type FileKind } from './kind';
import queue from '../submissions.module.css';
import styles from './files.module.css';

export type FileRowWire = {
  fileId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  kind: FileKind;
  source: 'submission' | 'task' | 'headshot' | 'unattached';
  ownerName: string | null;
  ownerEmail: string | null;
  taskName: string | null;
  taskStatus: string | null;
  submissionId: string | null;
  submissionRef: string | null;
  submissionTitle: string | null;
  submissionStatus: string | null;
  submissionInferred: boolean;
  version: number;
  versionCount: number;
  isCurrent: boolean;
  commentCount: number;
};

const SOURCE_LABEL: Record<FileRowWire['source'], string> = {
  submission: 'Submission answer',
  task: 'Speaker task',
  headshot: 'Headshot',
  unattached: 'Unattached',
};

/**
 * `CNT-13`. Two status vocabularies share one column, because an organizer scanning for what is
 * still outstanding does not care which table the answer came from: a submission answer inherits its
 * talk's decision, and a speaker-task upload carries its own assignment's progress. The filter keeps
 * them apart by prefixing the scope, so "Submitted" the decision and "Completed" the task cannot be
 * selected as though they were one thing.
 */
const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under review',
  accepted: 'Accepted',
  waitlisted: 'Waitlisted',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  waived: 'Waived',
};

const STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  draft: 'neutral',
  submitted: 'info',
  under_review: 'info',
  accepted: 'success',
  waitlisted: 'warning',
  declined: 'danger',
  withdrawn: 'neutral',
  not_started: 'warning',
  in_progress: 'info',
  completed: 'success',
  waived: 'neutral',
};

function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status.replace(/_/g, ' ');
}

type EffectiveStatus = { value: string; scope: 'submission' | 'task' };

/** The one status a row actually has: its talk's decision, or its task assignment's progress. */
function effectiveStatus(row: FileRowWire): EffectiveStatus | null {
  if (row.submissionStatus) return { value: row.submissionStatus, scope: 'submission' };
  if (row.taskStatus) return { value: row.taskStatus, scope: 'task' };
  return null;
}

function statusKey(status: EffectiveStatus): string {
  return `${status.scope}:${status.value}`;
}

function statusOptionLabel(status: EffectiveStatus): string {
  return `${status.scope === 'task' ? 'Task' : 'Submission'} · ${statusLabel(status.value)}`;
}

/** What the "Belongs to" cell says a file came from — the task's own name when there is one. */
function sourceLabel(row: FileRowWire): string {
  const base = SOURCE_LABEL[row.source];
  return row.source === 'task' && row.taskName ? `${base} · ${row.taskName}` : base;
}

function formatDate(iso: string): string {
  // Pinned locale and zone: this renders on a UTC Worker and rehydrates in the reader's own zone.
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Selection is the point of this screen, so the filters narrow and the checkbox column commits:
 * "select everything shown" after a filter is the fast path to "every accepted talk's deck", and it
 * is one keystroke away because `DataTable` already owns roving focus and space-to-toggle.
 */
export function FilesBrowser({ rows, storage }: { rows: FileRowWire[]; storage: StorageUsage }) {
  const { toast } = useToast();
  const downloadForm = useRef<HTMLFormElement>(null);
  const downloadIds = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [search, setSearch] = useState('');
  const [showSuperseded, setShowSuperseded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const statuses = useMemo(() => {
    const present = new Map<string, EffectiveStatus>();
    for (const row of rows) {
      const found = effectiveStatus(row);
      if (found) present.set(statusKey(found), found);
    }
    return [...present.entries()].sort(([, a], [, b]) =>
      statusOptionLabel(a).localeCompare(statusOptionLabel(b)),
    );
  }, [rows]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (!showSuperseded && !row.isCurrent) return false;
      if (kind && row.kind !== kind) return false;
      if (status) {
        const found = effectiveStatus(row);
        if (!found || statusKey(found) !== status) return false;
      }
      if (!needle) return true;
      return [
        row.filename,
        row.ownerName,
        row.ownerEmail,
        row.taskName,
        row.submissionRef,
        row.submissionTitle,
      ]
        .filter(Boolean)
        .some((value) => (value as string).toLowerCase().includes(needle));
    });
  }, [rows, kind, status, search, showSuperseded]);

  const byId = useMemo(() => new Map(rows.map((row) => [row.fileId, row])), [rows]);
  const selected = useMemo(
    () => selectedIds.map((id) => byId.get(id)).filter(Boolean) as FileRowWire[],
    [selectedIds, byId],
  );
  const selectedBytes = selected.reduce((sum, row) => sum + row.sizeBytes, 0);
  const visibleBytes = visible.reduce((sum, row) => sum + row.sizeBytes, 0);

  const download = useCallback(() => {
    const refusal = checkArchiveBudget(selected.length, selectedBytes);
    if (refusal) {
      toast({ title: 'Nothing downloaded', description: refusal.message, tone: 'warning' });
      return;
    }
    if (!downloadForm.current || !downloadIds.current) return;
    downloadIds.current.value = selected.map((row) => row.fileId).join(',');
    downloadForm.current.submit();
    toast({
      title: `Building an archive of ${selected.length} file${selected.length === 1 ? '' : 's'}`,
      description: 'The download starts as soon as the last file is read.',
      tone: 'info',
    });
  }, [selected, selectedBytes, toast]);

  const columns = useMemo<Array<DataTableColumn<FileRowWire>>>(
    () => [
      {
        id: 'filename',
        header: 'File',
        strong: true,
        width: '20%',
        space: 'wide',
        render: (row) => (
          <span className={styles.inlineRow}>
            <Link
              className={styles.fileLink}
              href={`/organizer/submissions/files/detail/${row.fileId}`}
              prefetch={false}
            >
              {row.filename}
            </Link>
            <a
              href={`/organizer/submissions/files/${row.fileId}`}
              aria-label={`Download ${row.filename}`}
            >
              <Download size={14} />
            </a>
          </span>
        ),
      },
      {
        id: 'versions',
        header: 'Version',
        width: '104px',
        space: 'compact',
        render: (row) => (
          <span className={styles.inlineRow}>
            <span className={styles.versionNumber}>v{row.version}</span>
            {row.versionCount > 1 && (
              <Badge tone={row.isCurrent ? 'info' : 'neutral'}>
                {row.isCurrent ? `${row.versionCount} versions` : 'Superseded'}
              </Badge>
            )}
          </span>
        ),
      },
      {
        id: 'comments',
        header: 'Feedback',
        width: '92px',
        space: 'compact',
        align: 'right',
        render: (row) =>
          row.commentCount > 0 ? (
            <span className={styles.inlineRow}>
              <MessageSquare size={13} aria-hidden /> {row.commentCount}
            </span>
          ) : (
            <span className={queue.muted}>—</span>
          ),
      },
      {
        id: 'kind',
        header: 'Kind',
        width: '104px',
        space: 'compact',
        render: (row) => <Badge tone="neutral">{fileKindLabel(row.kind)}</Badge>,
      },
      {
        id: 'size',
        header: 'Size',
        width: '88px',
        space: 'compact',
        align: 'right',
        mono: true,
        render: (row) => formatBytes(row.sizeBytes),
      },
      {
        id: 'owner',
        header: 'Belongs to',
        width: '13%',
        space: 'wide',
        render: (row) =>
          row.ownerName || row.ownerEmail ? (
            <span className={styles.owner}>
              <span>{row.ownerName ?? row.ownerEmail}</span>
              <span className={queue.muted}>{sourceLabel(row)}</span>
            </span>
          ) : (
            <span className={queue.muted}>{sourceLabel(row)}</span>
          ),
      },
      {
        id: 'submission',
        header: 'Submission',
        width: '16%',
        space: 'wide',
        render: (row) =>
          row.submissionId ? (
            <span className={styles.owner}>
              <Link className={styles.fileLink} href={`/organizer/submissions/${row.submissionId}`}>
                <span className={styles.ref}>{row.submissionRef}</span> {row.submissionTitle}
              </Link>
              {row.submissionInferred ? (
                <span className={queue.muted} title="This upload names no session; it is the only one this speaker is on.">
                  speaker&rsquo;s only session
                </span>
              ) : null}
            </span>
          ) : (
            <span className={queue.muted}>—</span>
          ),
      },
      {
        id: 'status',
        header: 'Status',
        width: '108px',
        space: 'compact',
        render: (row) => {
          const found = effectiveStatus(row);
          return found ? (
            <Badge tone={STATUS_TONE[found.value] ?? 'neutral'} title={statusOptionLabel(found)}>
              {statusLabel(found.value)}
            </Badge>
          ) : (
            <span className={queue.muted}>—</span>
          );
        },
      },
      {
        id: 'uploaded',
        header: 'Uploaded',
        width: '112px',
        mono: true,
        render: (row) => formatDate(row.createdAt),
      },
    ],
    [],
  );

  return (
    <div className={queue.page}>
      <FilesNav />

      <header className={queue.header}>
        <div className={queue.headings}>
          <span className={queue.eyebrow}>Review</span>
          <h1 className={queue.title}>Files</h1>
          <p className={queue.subtitle}>
            {visible.length} of {rows.length} file{rows.length === 1 ? '' : 's'} ·{' '}
            {formatBytes(visibleBytes)} shown ·{' '}
            {showSuperseded ? 'every version' : 'current versions only'}
          </p>
        </div>
        <div className={queue.actions}>
          <Button variant="ghost" iconLeft={<ChevronLeft size={14} />} href="/organizer/submissions">
            Back to queue
          </Button>
          <Button
            variant="primary"
            iconLeft={<Download size={14} />}
            disabled={selected.length === 0}
            onClick={download}
          >
            Download {selected.length > 0 ? `${selected.length} ` : ''}as zip
          </Button>
        </div>
      </header>

      <div
        className={styles.storageStatus}
        data-pressure={
          storage.backend === 'postgres' && storage.usedBytes !== null
            ? postgresStoragePressure(storage.usedBytes)
            : 'normal'
        }
      >
        {storage.backend === 'postgres' && storage.usedBytes !== null &&
        postgresStoragePressure(storage.usedBytes) !== 'normal' ? (
          <AlertTriangle size={18} aria-hidden />
        ) : (
          <Database size={18} aria-hidden />
        )}
        <div>
          <strong>
            {storage.backend === 'postgres'
              ? `Postgres file storage · ${formatBytes(storage.usedBytes ?? 0)} used`
              : `${storage.backend.toUpperCase()} object storage`}
          </strong>
          <p>
            {storage.backend === 'postgres'
              ? `Uploads count toward database size and every full backup. Move to R2 or S3 before ${formatBytes(storage.practicalCeilingBytes ?? 0)}; the warning starts at ${formatBytes(storage.warningBytes ?? 0)}.`
              : 'Uploads are stored outside Postgres in the configured object bucket.'}
          </p>
        </div>
      </div>

      <div className={queue.filters}>
        <Input
          className={queue.search}
          inputSize="sm"
          placeholder="Filename, speaker or submission"
          aria-label="Search files"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select
          selectSize="sm"
          aria-label="Filter by kind"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
        >
          <option value="">Any kind</option>
          {FILE_KINDS.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </Select>
        <Select
          selectSize="sm"
          aria-label="Filter by status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">Any status</option>
          {statuses.map(([key, entry]) => (
            <option key={key} value={key}>
              {statusOptionLabel(entry)}
            </option>
          ))}
        </Select>
        <Button
          size="sm"
          variant={showSuperseded ? 'secondary' : 'ghost'}
          onClick={() => setShowSuperseded((current) => !current)}
        >
          {showSuperseded ? 'Hide older versions' : 'Show older versions'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setSelectedIds(visible.map((row) => row.fileId))}
          disabled={visible.length === 0}
        >
          Select all shown
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

      {selected.length > 0 ? (
        <div className={queue.bulkBar}>
          <span className={queue.bulkCount}>
            {selected.length} selected · {formatBytes(selectedBytes)}
          </span>
          <Button size="sm" variant="primary" iconLeft={<FileDown size={14} />} onClick={download}>
            Download zip
          </Button>
        </div>
      ) : null}

      <div className={queue.tableWrap}>
        <DataTable
          columns={columns}
          rows={visible}
          getRowId={(row) => row.fileId}
          selectionMode="multiple"
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          label="Event files"
          emptyState={
            rows.length === 0
              ? 'Nothing has been uploaded to this event yet.'
              : 'No file matches these filters.'
          }
        />
      </div>

      <form
        ref={downloadForm}
        className={styles.hiddenForm}
        action="/organizer/submissions/files/download"
        method="post"
      >
        <input ref={downloadIds} type="hidden" name="ids" />
      </form>
    </div>
  );
}
