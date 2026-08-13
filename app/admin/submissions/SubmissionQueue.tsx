'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Clock, Download, Plus, Sparkles, Upload, X } from 'lucide-react';
import {
  Badge,
  Button,
  DataTable,
  Input,
  Kbd,
  Select,
  type DataTableColumn,
} from '../../../components/ui';
import { decideAction } from './actions';
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

export type QueueProps = {
  rows: QueueRowWire[];
  counts: Record<string, number>;
  tabs: Array<{ id: string; label: string }>;
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
  submitted: 'Before the council',
  under_review: 'Under deliberation',
  accepted: 'Proclaimed',
  waitlisted: 'Held in reserve',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
};

const SORTS: Array<{ id: string; label: string }> = [
  { id: 'score_desc', label: 'Judgment, high to low' },
  { id: 'score_asc', label: 'Judgment, low to high' },
  { id: 'ref_asc', label: 'Petition mark, ascending' },
  { id: 'ref_desc', label: 'Petition mark, descending' },
  { id: 'title_asc', label: 'Oration title, A–Z' },
  { id: 'newest', label: 'Most recent petition first' },
];

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

  const rows = props.rows;

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
        const skipped = result.data.skipped.length;
        setMessage(
          `${result.data.updated} updated${skipped > 0 ? `, ${skipped} skipped` : ''}.`,
        );
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
  }, [active, decide, rows, router, selected]);

  const columns = useMemo<Array<DataTableColumn<QueueRowWire>>>(
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
        header: 'Oration',
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
        header: 'Orator',
        width: '18%',
        render: (row) => <span className={styles.titleText}>{row.submitterName}</span>,
      },
      {
        id: 'track',
        header: 'Theme',
        width: '13%',
        render: (row) => row.trackName ?? <span className={styles.muted}>—</span>,
      },
      {
        id: 'format',
        header: 'Oration format',
        width: '12%',
        render: (row) => row.formatName ?? <span className={styles.muted}>—</span>,
      },
      {
        id: 'status',
        header: 'Standing',
        width: '110px',
        render: (row) => (
          <Badge tone={STATUS_TONE[row.status] ?? 'neutral'}>
            {STATUS_LABEL[row.status] ?? row.status}
          </Badge>
        ),
      },
      {
        id: 'progress',
        header: 'Judgments',
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

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headings}>
          <span className={styles.eyebrow}>The council</span>
          <h1 className={styles.title}>Petitions</h1>
          <p className={styles.subtitle}>
            {rows.length} shown
            {props.rounds.length > 0 && props.roundId
              ? ` · scoring ${props.rounds.find((round) => round.id === props.roundId)?.name ?? ''}`
              : ' · no council convened yet'}
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
                Import tablets
              </Button>
              <Button
                variant="ghost"
                iconLeft={<Download size={14} />}
                onClick={() => router.push('/admin/submissions/files')}
              >
                Archive
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
                Councils
              </Button>
              <Button
                variant="primary"
                iconLeft={<Plus size={14} />}
                onClick={() => router.push('/admin/submissions/new')}
              >
                Enter petition
              </Button>
            </>
          ) : null}
        </div>
      </header>

      <nav className={styles.tabs} aria-label="Petition standing">
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

      <div className={styles.filters}>
        <Input
          className={styles.search}
          inputSize="sm"
          placeholder="Search reference, title, or orator"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') navigate({ q: search });
          }}
          aria-label="Search petitions"
        />
        <Select
          selectSize="sm"
          value={props.trackId}
          onChange={(event) => navigate({ track: event.target.value })}
          aria-label="Filter by programme theme"
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
          aria-label="Filter by oration format"
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
          aria-label="Filter by petition mark"
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
          aria-label="Sort petitions"
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
            aria-label="Council round"
          >
            {props.rounds.map((round) => (
              <option key={round.id} value={round.id}>
                {round.name}
              </option>
            ))}
          </Select>
        ) : null}
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
        label="Petitions"
        emptyState="No petitions answer these filters."
      />

      <div className={styles.hintBar}>
        <span className={styles.hint}>
          <Kbd>j</Kbd>
          <Kbd>k</Kbd> move through the rolls
        </span>
        <span className={styles.hint}>
          <Kbd>x</Kbd> select
        </span>
        <span className={styles.hint}>
          <Kbd>o</Kbd> unroll
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
    </div>
  );
}
