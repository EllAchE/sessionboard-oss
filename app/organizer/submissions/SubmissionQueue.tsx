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
  Hand,
  Plus,
  Sparkles,
  Trash2,
  Undo2,
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
  Select,
  type DataTableColumn,
} from '../../../components/ui';
import { useHotkeys, useHotkeyScope } from '@/components/hotkeys/HotkeyProvider';
import { KeyLegend } from '@/components/hotkeys/KeyLegend';
import { SCOPES } from '@/lib/hotkeys/registry';
import { SCORE_SCALE } from '@/lib/review-scoring';
import { CopyPermalinkButton } from './CopyPermalinkButton';
import { ReviewExportButton } from './ReviewExportButton';
import {
  decideAction,
  deleteViewAction,
  listViewsAction,
  saveViewAction,
  stageAction,
} from './actions';
import styles from './submissions.module.css';

/**
 * `V-1`. What an organizer put on a row by hand, mirroring `StagedDecision` in the service.
 * `null` — the ordinary case — means the row sits wherever the panel's average puts it.
 */
export type StagedDecisionWire = 'accept' | 'decline' | 'hold' | null;

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
  stagedDecision: StagedDecisionWire;
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

/**
 * Only ever shown on an undecided row, because that is the only kind that stages. It reads as a
 * note on the row rather than a status: the badge says who put the proposal where it is, and the
 * status beside it still says what the submission actually *is*.
 */
const STAGE_LABEL: Record<'accept' | 'decline' | 'hold', string> = {
  accept: 'Staged to accept',
  decline: 'Staged to decline',
  hold: 'Held back',
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

type Decision = 'accept' | 'decline' | 'waitlist';
type Stage = 'accept' | 'decline' | 'hold' | null;

type SelectionActionsProps = {
  selectedCount: number;
  pending: boolean;
  onDecide: (decision: Decision) => void;
  onStage: (stage: Stage) => void;
};

/**
 * Queue placement and final decisions share one selection surface, while their labels and visual
 * treatment keep the reversible staging actions distinct from speaker-notifying decisions.
 */
export function SelectionActions({
  selectedCount,
  pending,
  onDecide,
  onStage,
}: SelectionActionsProps) {
  return (
    <div
      className={styles.bulkBar}
      role="group"
      aria-label={`Actions for ${selectedCount} selected`}
    >
      <span className={styles.bulkCount}>{selectedCount} selected</span>
      <div className={styles.bulkActions}>
        <div className={styles.bulkActionGroup} role="group" aria-label="Queue selected submissions">
          <span className={styles.bulkActionLabel}>Queue</span>
          <Button
            size="sm"
            variant="secondary"
            iconLeft={<Check size={14} />}
            loading={pending}
            onClick={() => onStage('accept')}
          >
            Accept queue
          </Button>
          <Button
            size="sm"
            variant="secondary"
            iconLeft={<X size={14} />}
            loading={pending}
            onClick={() => onStage('decline')}
          >
            Decline queue
          </Button>
          <Button
            size="sm"
            variant="ghost"
            iconLeft={<Hand size={14} />}
            loading={pending}
            onClick={() => onStage('hold')}
          >
            Hold in pending
          </Button>
          <Button
            size="sm"
            variant="ghost"
            iconLeft={<Undo2 size={14} />}
            loading={pending}
            onClick={() => onStage(null)}
          >
            Clear staging
          </Button>
        </div>
        <div
          className={styles.bulkActionGroup}
          role="group"
          aria-label="Decide selected submissions"
        >
          <span className={styles.bulkActionLabel}>Decision</span>
          <Button
            size="sm"
            iconLeft={<Check size={14} />}
            loading={pending}
            onClick={() => onDecide('accept')}
          >
            Accept
          </Button>
          <Button
            size="sm"
            iconLeft={<Clock size={14} />}
            loading={pending}
            onClick={() => onDecide('waitlist')}
          >
            Waitlist
          </Button>
          <Button
            size="sm"
            variant="danger"
            iconLeft={<X size={14} />}
            loading={pending}
            onClick={() => onDecide('decline')}
          >
            Decline
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Which queue a tab commits to, or null for a tab that is not a staging queue. */
function committedStage(tab: string): 'accept' | 'decline' | null {
  if (tab === 'accept-queue') return 'accept';
  if (tab === 'decline-queue') return 'decline';
  return null;
}

/**
 * The queue is where an organizer spends the most time, so it is keyboard-first: `j`/`k` move,
 * `x` selects, `a`/`d`/`w` decide the row under the cursor or the whole selection, `Enter` opens.
 * The legend under the table is the discoverability half — a hidden shortcut is not a feature.
 *
 * Staging shares those letters with Shift held: `⇧a`/`⇧d` stage into a queue, `⇧h` holds a row
 * back, `⇧c` clears the staging. Deliberately the same key as the decision it stages for, because
 * the pair is "propose it" and "do it" and a second unrelated letter would have to be memorised
 * separately. Nothing lowercase changed, so an organizer's existing muscle memory still decides.
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
  const [commitOpen, setCommitOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(DEFAULT_COLUMNS);

  const rows = props.rows;
  const queueStage = committedStage(props.tab);

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
      router.push(`/organizer/submissions?${params.toString()}`);
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
    (ids: string[], decision: Decision) => {
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

  /**
   * Staging, in the same shape as `decide` and deliberately not sharing a code path with it: this
   * one moves a proposal between queues and never writes a status, so the wording it reports back
   * has to be free of the word "decided".
   */
  const stage = useCallback(
    (ids: string[], next: Stage) => {
      if (ids.length === 0 || !props.canDecide) return;
      setMessage(null);
      startTransition(async () => {
        const result = await stageAction(ids, next);
        if (!result.ok) {
          setMessage(result.message);
          return;
        }
        const { updated } = result.data;
        const skipped = result.data.skipped.length;
        const where =
          next === null
            ? 'back to the panel’s score'
            : next === 'hold'
              ? 'held in Pending'
              : `staged to ${next}`;
        const parts = [`${updated} ${where}`];
        if (skipped > 0) parts.push(`${skipped} already decided`);
        setMessage(`${parts.join(', ')}.`);
        setSelected([]);
        router.refresh();
      });
    },
    [props.canDecide, router],
  );

  /**
   * Committing the batch: every row the open queue is currently showing, in one decision. It takes
   * exactly what is on screen rather than re-deriving the queue on the server, so a narrowed filter
   * narrows the commit too — an organizer who filtered to one track commits that track, which is
   * the only reading of the button that cannot surprise them.
   */
  const commitQueue = useCallback(() => {
    if (!queueStage) return;
    setCommitOpen(false);
    decide(
      rows.map((row) => row.id),
      queueStage,
    );
  }, [decide, queueStage, rows]);

  /**
   * Shortcuts land on the window rather than the grid so they work whether or not the table has
   * focus. The typing guard, the modifier guard and the "a dialog owns the keyboard" rule all live
   * in the hotkey layer now — the last of those is the `ui.dialog` scope below, which is `modal`
   * and therefore silences this scope wholesale while any of the three panels is open.
   */
  const activeRow = rows[Math.max(0, Math.min(rows.length - 1, active))];
  /** A shortcut acts on the selection when there is one, and on the row under the cursor when not. */
  const subjects = selected.length > 0 ? selected : activeRow ? [activeRow.id] : [];

  useHotkeys(
    SCOPES.submissionsQueue,
    {
      next: () => setActive((index) => Math.min(rows.length - 1, index + 1)),
      prev: () => setActive((index) => Math.max(0, index - 1)),
      toggle: () => {
        if (!activeRow) return;
        setSelected((current) =>
          current.includes(activeRow.id)
            ? current.filter((id) => id !== activeRow.id)
            : [...current, activeRow.id],
        );
      },
      open: () => {
        if (activeRow) router.push(`/organizer/submissions/${activeRow.id}`);
      },
      clear: () => setSelected([]),

      accept: () => decide(subjects, 'accept'),
      decline: () => decide(subjects, 'decline'),
      waitlist: () => decide(subjects, 'waitlist'),

      // Shift is "propose it" to the same letter's "do it".
      'stage-accept': () => stage(subjects, 'accept'),
      'stage-decline': () => stage(subjects, 'decline'),
      'stage-hold': () => stage(subjects, 'hold'),
      'stage-clear': () => stage(subjects, null),
    },
    { active: rows.length > 0 },
  );

  useHotkeyScope(SCOPES.dialog, saveOpen || columnsOpen || commitOpen);

  const allColumns = useMemo<Array<DataTableColumn<QueueRowWire>>>(
    () => [
      {
        id: 'ref',
        header: 'Ref',
        width: '92px',
        space: 'compact',
        mono: true,
        render: (row) => (
          <Link className={styles.rowLink} href={`/organizer/submissions/${row.id}`}>
            {row.displayRef}
          </Link>
        ),
      },
      {
        id: 'title',
        header: 'Title',
        strong: true,
        space: 'wide',
        render: (row) => (
          <span className={styles.cellTitle}>
            <Link className={styles.rowLink} href={`/organizer/submissions/${row.id}`}>
              <span className={styles.titleText}>{row.title}</span>
            </Link>
            {row.hasAiReview ? <Sparkles size={12} aria-label="Has an AI suggestion" /> : null}
            <CopyPermalinkButton
              path={`/organizer/submissions/${row.id}`}
              subject={row.displayRef}
              compact
            />
          </span>
        ),
      },
      {
        id: 'submitter',
        header: 'Speaker',
        width: '16%',
        render: (row) => <span className={styles.titleText}>{row.submitterName}</span>,
      },
      {
        id: 'track',
        header: 'Track',
        width: '10%',
        render: (row) => row.trackName ?? <span className={styles.muted}>—</span>,
      },
      {
        id: 'format',
        header: 'Format',
        width: '9%',
        render: (row) => row.formatName ?? <span className={styles.muted}>—</span>,
      },
      {
        id: 'status',
        header: 'Status',
        width: '140px',
        space: 'compact',
        truncate: false,
        // The staging note sits under the status rather than replacing it: staging is what an
        // organizer proposes, the status is what the submission is, and they are never the same
        // claim. A row nobody staged renders exactly the single badge it always did.
        render: (row) => (
          <span className={styles.statusCell}>
            <Badge tone={STATUS_TONE[row.status] ?? 'neutral'}>
              {STATUS_LABEL[row.status] ?? row.status}
            </Badge>
            {row.stagedDecision ? (
              <Badge tone="info">{STAGE_LABEL[row.stagedDecision]}</Badge>
            ) : null}
          </span>
        ),
      },
      {
        id: 'progress',
        header: 'Reviews',
        width: '84px',
        space: 'compact',
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
        space: 'compact',
        align: 'right',
        // A bare 3.2 tells an organizer nothing until they know the scale, and scorecards are free
        // to run their criteria on any max, so the denominator travels with the number.
        render: (row) =>
          row.averageScore === null ? (
            <span className={styles.muted}>—</span>
          ) : (
            <span className={styles.scoreCell}>
              <span className={styles.scoreNumber}>{row.averageScore.toFixed(1)}</span>
              <span className={styles.scoreScale}>/{SCORE_SCALE}</span>
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
              ? ` · scoring · ${props.rounds.find((round) => round.id === props.roundId)?.name ?? ''}`
              : ' · no review round yet'}
          </p>
        </div>
        <div className={styles.actions}>
          {props.canDecide ? (
            <>
              {/*
                Links, not click handlers. This header is the only route to the rounds screen, and
                an `onClick` on a `<button>` does nothing at all until React has hydrated — an
                organizer who reached this page and clicked straight away got no navigation, no
                error and no URL change, which reads as a dead control rather than as "not yet".
                An `href` is live in the first paint, survives a middle-click, and shows where it
                goes on hover, which is also how the rounds screen stops being a URL to guess.
              */}
              <Button variant="ghost" iconLeft={<Upload size={14} />} href="/organizer/submissions/import">
                Import
              </Button>
              <Button variant="ghost" iconLeft={<Download size={14} />} href="/organizer/submissions/files">
                Files
              </Button>
              {props.roundId ? <ReviewExportButton roundId={props.roundId} /> : null}
              <Button variant="ghost" href="/organizer/submissions/rounds">
                Rounds
              </Button>
              <Button variant="primary" iconLeft={<Plus size={14} />} href="/organizer/submissions/new">
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

      {/* A staging queue is a reading of the panel's work first, so it has to say what put a
          proposal in it — and the commit for the whole batch belongs beside that sentence. */}
      {tabHint || (queueStage && props.canDecide) ? (
        <div className={styles.queueBar}>
          {tabHint ? <p className={styles.tabHint}>{tabHint}</p> : null}
          {queueStage && props.canDecide ? (
            <Button
              size="sm"
              variant={queueStage === 'accept' ? 'primary' : 'danger'}
              iconLeft={queueStage === 'accept' ? <Check size={14} /> : <X size={14} />}
              loading={pending}
              disabled={rows.length === 0}
              onClick={() => setCommitOpen(true)}
            >
              {queueStage === 'accept' ? 'Accept' : 'Decline'} all {rows.length} shown
            </Button>
          ) : null}
        </div>
      ) : null}

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
        <SelectionActions
          selectedCount={selected.length}
          pending={pending}
          onDecide={(decision) => decide(selected, decision)}
          onStage={(next) => stage(selected, next)}
        />
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
        onRowActivate={(row) => router.push(`/organizer/submissions/${row.id}`)}
        label="Submissions"
        emptyState="No submissions match these filters."
      />

      <KeyLegend
        scope={SCOPES.submissionsQueue}
        className={styles.hintBar}
        rowClassName={styles.hint}
        rows={[
          { id: 'next', text: 'next' },
          { id: 'prev', text: 'previous' },
          { id: 'toggle', text: 'select' },
          { id: 'open', text: 'open' },
          ...(props.canDecide
            ? [
                { id: 'accept', text: 'accept' },
                { id: 'waitlist', text: 'waitlist' },
                { id: 'decline', text: 'decline' },
                { id: 'stage-accept', text: 'stage accept' },
                { id: 'stage-decline', text: 'stage decline' },
                { id: 'stage-hold', text: 'hold' },
                { id: 'stage-clear', text: 'clear staging' },
              ]
            : []),
          { id: 'clear', text: 'clear selection' },
        ]}
      />

      <Dialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        title="Save this view"
        description="Save these filters, sort, and columns."
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

      {/* The one place the queue leaves staging behind. Everything else on this screen is
          reversible; this sends mail, so it asks first and says how many. */}
      <Dialog
        open={commitOpen}
        onOpenChange={setCommitOpen}
        title={queueStage === 'accept' ? 'Accept this batch' : 'Decline this batch'}
        description={`${rows.length} submission${rows.length === 1 ? '' : 's'}, every row this queue is showing, filters included. Each speaker is notified, and the staging is cleared as the decision lands.`}
        size="sm"
        footer={
          <>
            <Button
              variant={queueStage === 'accept' ? 'primary' : 'danger'}
              loading={pending}
              onClick={commitQueue}
            >
              {queueStage === 'accept' ? 'Accept' : 'Decline'} all {rows.length}
            </Button>
            <Button variant="ghost" onClick={() => setCommitOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <p className={styles.tabHint}>Already decided submissions are skipped.</p>
      </Dialog>

      <Dialog
        open={columnsOpen}
        onOpenChange={setColumnsOpen}
        title="Columns"
        description="Choose visible columns. At least one is required."
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
