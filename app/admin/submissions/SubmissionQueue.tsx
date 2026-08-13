'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BookmarkPlus,
  Check,
  Clock,
  Columns3,
  Download,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  Dialog,
  Input,
  Kbd,
  Select,
  type DataTableColumn,
} from '../../../components/ui';
import { decideAction, deleteViewAction, listViewsAction, saveViewAction } from './actions';
import styles from './submissions.module.css';

export type QueueRowWire = {
  id: string;
  ref: number;
  displayRef: string;
  title: string;
  status: string;
  trackId: string | null;
  trackName: string | null;
  formatId: string | null;
  formatName: string | null;
  tagIds: string[];
  submitterName: string;
  averageScore: number | null;
  spread: number | null;
  assignedCount: number;
  completedCount: number;
  hasAiReview: boolean;
};

export type SavedViewWire = { id: string; name: string; filters: Record<string, unknown> };

export type QueueProps = {
  rows: QueueRowWire[];
  counts: Record<string, number>;
  tabs: Array<{ id: string; label: string; hint?: string | null }>;
  tab: string;
  sort: string;
  trackId: string;
  formatId: string;
  tagId: string;
  search: string;
  tracks: Array<{ id: string; name: string }>;
  formats: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string }>;
  rounds: Array<{ id: string; name: string; status: string }>;
  roundId: string | null;
  canDecide: boolean;
  aiEnabled: boolean;
  savedViews: SavedViewWire[];
};

const STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  draft: 'neutral',
  submitted: 'info',
  under_review: 'info',
  accepted: 'success',
  waitlisted: 'warning',
  declined: 'danger',
  withdrawn: 'neutral',
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'In review',
  accepted: 'Accepted',
  waitlisted: 'Waitlist',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
};

const SORTS: Array<{ id: string; label: string }> = [
  { id: 'score_desc', label: 'Score, high to low' },
  { id: 'score_asc', label: 'Score, low to high' },
  { id: 'ref_asc', label: 'Ref, ascending' },
  { id: 'ref_desc', label: 'Ref, descending' },
  { id: 'title_asc', label: 'Title, A–Z' },
  { id: 'newest', label: 'Newest first' },
];

/**
 * `V-6`. The full column set in its canonical order. Everything is on by default, so an organizer
 * who never opens the picker sees exactly the queue they saw before it existed.
 */
export const COLUMNS: Array<{ id: string; label: string }> = [
  { id: 'ref', label: 'Ref' },
  { id: 'title', label: 'Title' },
  { id: 'submitter', label: 'Speaker' },
  { id: 'track', label: 'Track' },
  { id: 'format', label: 'Format' },
  { id: 'status', label: 'Status' },
  { id: 'progress', label: 'Reviews' },
  { id: 'score', label: 'Score' },
];

export const DEFAULT_COLUMNS = COLUMNS.map((column) => column.id);

/**
 * Column choice rides along in a saved view's `filters` JSON, which is what makes this feature
 * migration-free. This key is the second half: it remembers the picker between navigations for
 * someone who never names a view, since every filter change is a fresh page load.
 */
const COLUMN_STORAGE_KEY = 'cicero.submissions.columns';

function viewString(filters: Record<string, unknown>, key: string): string {
  const value = filters[key];
  return typeof value === 'string' ? value : '';
}

/** Anything unrecognised falls back to the full set rather than rendering an empty table. */
export function viewColumns(value: unknown): string[] {
  if (!Array.isArray(value)) return DEFAULT_COLUMNS;
  const chosen = DEFAULT_COLUMNS.filter((id) => value.includes(id));
  return chosen.length > 0 ? chosen : DEFAULT_COLUMNS;
}

/**
 * The queue is where an organizer spends the most time, so it is keyboard-first: `j`/`k` move,
 * `x` selects, `a`/`d`/`w` decide the row under the cursor or the whole selection, `Enter` opens.
 * The legend under the table is the discoverability half — a hidden shortcut is not a feature.
 */
export function SubmissionQueue(props: QueueProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const [search, setSearch] = useState(props.search);
  const [message, setMessage] = useState<string | null>(null);
  const [savedViews, setSavedViews] = useState<SavedViewWire[]>(props.savedViews);
  const [viewId, setViewId] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);
  const [viewName, setViewName] = useState('');
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(DEFAULT_COLUMNS);

  const rows = props.rows;

  useEffect(() => setSavedViews(props.savedViews), [props.savedViews]);

  // Read once on mount so the server-rendered table and the first client paint agree.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(COLUMN_STORAGE_KEY);
      if (stored) setVisibleColumns(viewColumns(JSON.parse(stored)));
    } catch {
      // A corrupt entry just means the default eight.
    }
  }, []);

  const chooseColumns = useCallback((next: string[]) => {
    setVisibleColumns(next);
    try {
      window.localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private browsing or a full quota: the choice holds for this page, just not the next.
    }
  }, []);

  const toggleColumn = useCallback(
    (id: string) => {
      const next = visibleColumns.includes(id)
        ? visibleColumns.filter((entry) => entry !== id)
        : [...visibleColumns, id];
      if (next.length === 0) return;
      chooseColumns(next);
    },
    [chooseColumns, visibleColumns],
  );

  useEffect(() => {
    setSelected([]);
    setActive(0);
  }, [props.tab, props.sort, props.trackId, props.formatId, props.tagId, props.search]);

  const navigate = useCallback(
    (patch: Record<string, string>) => {
      const params = new URLSearchParams();
      const base: Record<string, string> = {
        tab: props.tab,
        sort: props.sort,
        track: props.trackId,
        format: props.formatId,
        tag: props.tagId,
        q: props.search,
        round: props.roundId ?? '',
        ...patch,
      };
      for (const [key, value] of Object.entries(base)) {
        if (value) params.set(key, value);
      }
      router.push(`/admin/submissions?${params.toString()}`);
    },
    [props.formatId, props.roundId, props.search, props.sort, props.tab, props.tagId, props.trackId, router],
  );

  const refreshViews = useCallback(async () => {
    const result = await listViewsAction();
    if (result.ok) setSavedViews(result.data);
  }, []);

  /** A saved view is a complete filter state, so every field is written — blanks included. */
  const applyView = useCallback(
    (id: string) => {
      setViewId(id);
      const view = savedViews.find((entry) => entry.id === id);
      if (!view) return;
      chooseColumns(viewColumns(view.filters.columns));
      const q = viewString(view.filters, 'q');
      setSearch(q);
      navigate({
        tab: viewString(view.filters, 'tab'),
        sort: viewString(view.filters, 'sort'),
        track: viewString(view.filters, 'track'),
        format: viewString(view.filters, 'format'),
        tag: viewString(view.filters, 'tag'),
        q,
      });
    },
    [chooseColumns, navigate, savedViews],
  );

  const saveCurrentView = useCallback(() => {
    const name = viewName.trim();
    if (!name) return;
    setMessage(null);
    startTransition(async () => {
      const result = await saveViewAction(name, {
        tab: props.tab,
        sort: props.sort,
        track: props.trackId,
        format: props.formatId,
        tag: props.tagId,
        q: props.search,
        columns: visibleColumns,
      });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setSaveOpen(false);
      setViewName('');
      setViewId(result.data.id);
      await refreshViews();
      setMessage(`Saved “${result.data.name}”.`);
    });
  }, [
    props.formatId,
    props.search,
    props.sort,
    props.tab,
    props.tagId,
    props.trackId,
    refreshViews,
    viewName,
    visibleColumns,
  ]);

  const removeView = useCallback(() => {
    if (!viewId) return;
    setMessage(null);
    startTransition(async () => {
      const result = await deleteViewAction(viewId);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setViewId('');
      await refreshViews();
      setMessage('View deleted.');
    });
  }, [refreshViews, viewId]);

  const decide = useCallback(
    (ids: string[], decision: 'accept' | 'decline' | 'waitlist' | 'reset') => {
      if (ids.length === 0 || !props.canDecide) return;
      setMessage(null);
      startTransition(async () => {
        const result = await decideAction(ids, decision);
        if (!result.ok) {
          setMessage(result.message);
          return;
        }
        const { updated, notified, notifyFailed } = result.data;
        const skipped = result.data.skipped.length;
        const parts = [`${updated} updated`];
        if (skipped > 0) parts.push(`${skipped} skipped`);
        if (notified > 0) parts.push(`${notified} notified`);
        // Best-effort sending: the decision stuck either way, so this is the organizer's cue to
        // resend rather than a reason to think nothing happened.
        if (notifyFailed > 0) parts.push(`${notifyFailed} could not be notified`);
        setMessage(`${parts.join(', ')}.`);
        setSelected([]);
        router.refresh();
      });
    },
    [props.canDecide, router],
  );

  // Shortcuts land on the window rather than the grid so they work whether or not the table has
  // focus; anything typed into a field is left alone.
  useEffect(() => {
    const isTyping = (target: EventTarget | null) => {
      const node = target as HTMLElement | null;
      if (!node) return false;
      return (
        node.tagName === 'INPUT' ||
        node.tagName === 'TEXTAREA' ||
        node.tagName === 'SELECT' ||
        node.isContentEditable
      );
    };

    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      // A dialog owns the keyboard while it is open; `a` in the columns panel must not accept.
      if (saveOpen || columnsOpen) return;
      if (rows.length === 0) return;
      const row = rows[Math.max(0, Math.min(rows.length - 1, active))];

      switch (event.key) {
        case 'j':
          event.preventDefault();
          setActive((index) => Math.min(rows.length - 1, index + 1));
          break;
        case 'k':
          event.preventDefault();
          setActive((index) => Math.max(0, index - 1));
          break;
        case 'x':
          event.preventDefault();
          setSelected((current) =>
            current.includes(row.id)
              ? current.filter((id) => id !== row.id)
              : [...current, row.id],
          );
          break;
        case 'o':
        case 'Enter':
          event.preventDefault();
          router.push(`/admin/submissions/${row.id}`);
          break;
        case 'a':
          event.preventDefault();
          decide(selected.length > 0 ? selected : [row.id], 'accept');
          break;
        case 'd':
          event.preventDefault();
          decide(selected.length > 0 ? selected : [row.id], 'decline');
          break;
        case 'w':
          event.preventDefault();
          decide(selected.length > 0 ? selected : [row.id], 'waitlist');
          break;
        case 'Escape':
          setSelected([]);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, columnsOpen, decide, rows, router, saveOpen, selected]);

  const allColumns = useMemo<Array<DataTableColumn<QueueRowWire>>>(
    () => [
      {
        id: 'ref',
        header: 'Ref',
        width: '92px',
        mono: true,
        render: (row) => (
          <Link className={styles.rowLink} href={`/admin/submissions/${row.id}`}>
            {row.displayRef}
          </Link>
        ),
      },
      {
        id: 'title',
        header: 'Title',
        strong: true,
        render: (row) => (
          <span className={styles.cellTitle}>
            <Link className={styles.rowLink} href={`/admin/submissions/${row.id}`}>
              <span className={styles.titleText}>{row.title}</span>
            </Link>
            {row.hasAiReview ? <Sparkles size={12} aria-label="Has an AI suggestion" /> : null}
          </span>
        ),
      },
      {
        id: 'submitter',
        header: 'Speaker',
        width: '18%',
        render: (row) => <span className={styles.titleText}>{row.submitterName}</span>,
      },
      {
        id: 'track',
        header: 'Track',
        width: '13%',
        render: (row) => row.trackName ?? <span className={styles.muted}>—</span>,
      },
      {
        id: 'format',
        header: 'Format',
        width: '12%',
        render: (row) => row.formatName ?? <span className={styles.muted}>—</span>,
      },
      {
        id: 'status',
        header: 'Status',
        width: '110px',
        render: (row) => (
          <Badge tone={STATUS_TONE[row.status] ?? 'neutral'}>
            {STATUS_LABEL[row.status] ?? row.status}
          </Badge>
        ),
      },
      {
        id: 'progress',
        header: 'Reviews',
        width: '84px',
        align: 'right',
        render: (row) =>
          row.assignedCount === 0 ? (
            <span className={styles.muted}>—</span>
          ) : (
            <span className={styles.progress}>
              {row.completedCount}/{row.assignedCount}
            </span>
          ),
      },
      {
        id: 'score',
        header: 'Score',
        width: '92px',
        align: 'right',
        render: (row) =>
          row.averageScore === null ? (
            <span className={styles.muted}>—</span>
          ) : (
            <span className={styles.scoreCell}>
              <span className={styles.scoreNumber}>{row.averageScore.toFixed(1)}</span>
            </span>
          ),
      },
    ],
    [],
  );

  const tabHint = props.tabs.find((tab) => tab.id === props.tab)?.hint ?? null;

  // Filtering the canonical list keeps column order stable no matter what order they were toggled.
  const columns = useMemo(
    () => allColumns.filter((column) => visibleColumns.includes(column.id)),
    [allColumns, visibleColumns],
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headings}>
          <span className={styles.eyebrow}>Review</span>
          <h1 className={styles.title}>Submissions</h1>
          <p className={styles.subtitle}>
            {rows.length} shown
            {props.rounds.length > 0 && props.roundId
              ? ` · scoring ${props.rounds.find((round) => round.id === props.roundId)?.name ?? ''}`
              : ' · no review round yet'}
          </p>
        </div>
        <div className={styles.actions}>
          {props.canDecide ? (
            <>
              <Button
                variant="ghost"
                iconLeft={<Upload size={14} />}
                onClick={() => router.push('/admin/submissions/import')}
              >
                Import
              </Button>
              <Button
                variant="ghost"
                iconLeft={<Download size={14} />}
                onClick={() => router.push('/admin/submissions/files')}
              >
                Files
              </Button>
              {props.roundId ? (
                <Button
                  variant="ghost"
                  iconLeft={<Download size={14} />}
                  href={`/admin/submissions/export?round=${encodeURIComponent(props.roundId)}`}
                >
                  Export CSV
                </Button>
              ) : null}
              <Button variant="ghost" onClick={() => router.push('/admin/submissions/rounds')}>
                Rounds
              </Button>
              <Button
                variant="primary"
                iconLeft={<Plus size={14} />}
                onClick={() => router.push('/admin/submissions/new')}
              >
                Add submission
              </Button>
            </>
          ) : null}
        </div>
      </header>

      <nav className={styles.tabs} aria-label="Submission status">
        {props.tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={styles.tab}
            data-selected={tab.id === props.tab}
            onClick={() => navigate({ tab: tab.id })}
          >
            {tab.label}
            <span className={styles.tabCount}>{props.counts[tab.id] ?? 0}</span>
          </button>
        ))}
      </nav>

      {/* A staging queue is derived, so it has to say what put a proposal in it. */}
      {tabHint ? <p className={styles.tabHint}>{tabHint}</p> : null}

      <div className={styles.filters}>
        <Input
          className={styles.search}
          inputSize="sm"
          placeholder="Search ref, title or speaker"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') navigate({ q: search });
          }}
          aria-label="Search submissions"
        />
        <Select
          selectSize="sm"
          value={props.trackId}
          onChange={(event) => navigate({ track: event.target.value })}
          aria-label="Filter by track"
        >
          <option value="">All tracks</option>
          {props.tracks.map((track) => (
            <option key={track.id} value={track.id}>
              {track.name}
            </option>
          ))}
        </Select>
        <Select
          selectSize="sm"
          value={props.formatId}
          onChange={(event) => navigate({ format: event.target.value })}
          aria-label="Filter by format"
        >
          <option value="">All formats</option>
          {props.formats.map((format) => (
            <option key={format.id} value={format.id}>
              {format.name}
            </option>
          ))}
        </Select>
        <Select
          selectSize="sm"
          value={props.tagId}
          onChange={(event) => navigate({ tag: event.target.value })}
          aria-label="Filter by tag"
        >
          <option value="">All tags</option>
          {props.tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </Select>
        <Select
          selectSize="sm"
          value={props.sort}
          onChange={(event) => navigate({ sort: event.target.value })}
          aria-label="Sort submissions"
        >
          {SORTS.map((sort) => (
            <option key={sort.id} value={sort.id}>
              {sort.label}
            </option>
          ))}
        </Select>
        {props.rounds.length > 1 ? (
          <Select
            selectSize="sm"
            value={props.roundId ?? ''}
            onChange={(event) => navigate({ round: event.target.value })}
            aria-label="Review round"
          >
            {props.rounds.map((round) => (
              <option key={round.id} value={round.id}>
                {round.name}
              </option>
            ))}
          </Select>
        ) : null}
      </div>

      <div className={styles.viewBar}>
        <Select
          className={styles.viewSelect}
          selectSize="sm"
          value={viewId}
          onChange={(event) => applyView(event.target.value)}
          aria-label="Saved views"
        >
          <option value="">Saved views</option>
          {savedViews.map((view) => (
            <option key={view.id} value={view.id}>
              {view.name}
            </option>
          ))}
        </Select>
        <Button
          size="sm"
          variant="ghost"
          iconLeft={<BookmarkPlus size={14} />}
          onClick={() => setSaveOpen(true)}
        >
          Save view
        </Button>
        {viewId ? (
          <Button
            size="sm"
            variant="ghost"
            iconLeft={<Trash2 size={14} />}
            loading={pending}
            onClick={removeView}
          >
            Delete view
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          iconLeft={<Columns3 size={14} />}
          onClick={() => setColumnsOpen(true)}
        >
          Columns ({visibleColumns.length}/{COLUMNS.length})
        </Button>
      </div>

      {message ? <p className={styles.notice}>{message}</p> : null}

      {selected.length > 0 && props.canDecide ? (
        <div className={styles.bulkBar}>
          <span className={styles.bulkCount}>{selected.length} selected</span>
          <Button
            size="sm"
            iconLeft={<Check size={14} />}
            loading={pending}
            onClick={() => decide(selected, 'accept')}
          >
            Accept
          </Button>
          <Button
            size="sm"
            iconLeft={<Clock size={14} />}
            loading={pending}
            onClick={() => decide(selected, 'waitlist')}
          >
            Waitlist
          </Button>
          <Button
            size="sm"
            variant="danger"
            iconLeft={<X size={14} />}
            loading={pending}
            onClick={() => decide(selected, 'decline')}
          >
            Decline
          </Button>
          <Button size="sm" variant="ghost" onClick={() => decide(selected, 'reset')}>
            Reset
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      ) : null}

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        selectionMode={props.canDecide ? 'multiple' : 'none'}
        selectedIds={selected}
        onSelectionChange={setSelected}
        activeIndex={Math.max(0, Math.min(rows.length - 1, active))}
        onActiveIndexChange={setActive}
        onRowActivate={(row) => router.push(`/admin/submissions/${row.id}`)}
        label="Submissions"
        emptyState="No submissions match these filters."
      />

      <div className={styles.hintBar}>
        <span className={styles.hint}>
          <Kbd>j</Kbd>
          <Kbd>k</Kbd> move
        </span>
        <span className={styles.hint}>
          <Kbd>x</Kbd> select
        </span>
        <span className={styles.hint}>
          <Kbd>o</Kbd> open
        </span>
        {props.canDecide ? (
          <>
            <span className={styles.hint}>
              <Kbd>a</Kbd> accept
            </span>
            <span className={styles.hint}>
              <Kbd>w</Kbd> waitlist
            </span>
            <span className={styles.hint}>
              <Kbd>d</Kbd> decline
            </span>
          </>
        ) : null}
        <span className={styles.hint}>
          <Kbd>esc</Kbd> clear selection
        </span>
      </div>

      <Dialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        title="Save this view"
        description="Keeps the current tab, filters, sort and columns under a name you can come back to."
        size="sm"
        footer={
          <>
            <Button variant="primary" loading={pending} onClick={saveCurrentView}>
              Save view
            </Button>
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <Input
          inputSize="sm"
          placeholder="Unscored keynotes"
          value={viewName}
          onChange={(event) => setViewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') saveCurrentView();
          }}
          aria-label="View name"
        />
      </Dialog>

      <Dialog
        open={columnsOpen}
        onOpenChange={setColumnsOpen}
        title="Columns"
        description="Choose what the queue shows. At least one column stays on."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => chooseColumns(DEFAULT_COLUMNS)}>
              Reset
            </Button>
            <Button variant="primary" onClick={() => setColumnsOpen(false)}>
              Done
            </Button>
          </>
        }
      >
        <div className={styles.columnPicker}>
          {COLUMNS.map((column) => {
            const checked = visibleColumns.includes(column.id);
            return (
              <label className={styles.columnOption} key={column.id}>
                <Checkbox
                  checked={checked}
                  disabled={checked && visibleColumns.length === 1}
                  onChange={() => toggleColumn(column.id)}
                />
                <span>{column.label}</span>
              </label>
            );
          })}
        </div>
      </Dialog>
    </div>
  );
}
