'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Avatar, Badge, DataTable, Input, Select, type DataTableColumn } from '@/components/ui';
import type { SpeakerProfile, SpeakerWorkflowStatus } from '@/lib/services/participants';
import { SpeakerStatus, type StatusOption } from './SpeakerStatus';
import { ViewPortalAsRowButton } from './ViewPortalAs';
import styles from './speakers.module.css';

type Facet = 'all' | 'incomplete' | 'travel' | 'overdue';

const FACETS: Array<{ id: Facet; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'incomplete', label: 'Incomplete profile' },
  { id: 'travel', label: 'Missing travel info' },
  { id: 'overdue', label: 'Overdue tasks' },
];

function matchesFacet(row: SpeakerProfile, facet: Facet): boolean {
  if (facet === 'incomplete') return !row.hasBio || !row.hasHeadshot;
  if (facet === 'travel') return !row.hasTravelDetail;
  if (facet === 'overdue') return row.tasksOverdue > 0;
  return true;
}

function haystack(row: SpeakerProfile, statusLabel: string): string {
  return [
    row.name,
    row.email,
    row.jobTitle,
    row.company,
    row.pronouns,
    row.bioMarkdown,
    row.timezone,
    row.dietaryNotes,
    row.accessibilityNotes,
    statusLabel,
    ...row.acceptedSessions,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function columns(
  statuses: StatusOption[],
  canManage: boolean,
): Array<DataTableColumn<SpeakerProfile>> {
  return [
    {
      id: 'name',
      header: 'Speaker',
      width: '28%',
      render: (row) => (
        <span className={styles.person}>
          <Avatar
            name={row.name}
            size="sm"
            src={row.headshotFileId ? `/admin/speakers/photo/${row.headshotFileId}` : undefined}
          />
          <span className={styles.personText}>
            <Link href={`/admin/speakers/${row.id}`} className={styles.personName}>
              {row.name}
            </Link>
            <span className={styles.personMeta}>{row.email}</span>
          </span>
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      width: '15%',
      render: (row) => (
        <SpeakerStatus
          participantId={row.id}
          status={row.workflowStatus}
          options={statuses}
          canManage={canManage}
          compact
        />
      ),
    },
    {
      id: 'role',
      header: 'Role',
      width: '18%',
      render: (row) => (
        <span className={styles.personText}>
          <span className={styles.personMeta}>{row.jobTitle || '—'}</span>
          <span className={styles.personMeta}>{row.company || '—'}</span>
        </span>
      ),
    },
    {
      id: 'profile',
      header: 'Profile',
      width: '14%',
      render: (row) => (
        <span className={styles.badgeRow}>
          <Badge tone={row.hasBio ? 'success' : 'warning'}>{row.hasBio ? 'Bio' : 'No bio'}</Badge>
          <Badge tone={row.hasHeadshot ? 'success' : 'warning'}>
            {row.hasHeadshot ? 'Photo' : 'No photo'}
          </Badge>
        </span>
      ),
    },
    {
      id: 'travel',
      header: 'Travel & logistics',
      width: '15%',
      render: (row) =>
        row.hasTravelDetail ? (
          <span className={styles.badgeRow}>
            {row.timezone ? <Badge tone="info">{row.timezone}</Badge> : null}
            {row.dietaryNotes ? <Badge tone="neutral">Dietary</Badge> : null}
            {row.accessibilityNotes ? <Badge tone="neutral">Accessibility</Badge> : null}
          </span>
        ) : (
          <span className={styles.muted}>Nothing on file</span>
        ),
    },
    ...(canManage
      ? [
          {
            id: 'viewAs',
            header: <span className={styles.visuallyHidden}>View as</span>,
            width: 'var(--control-md)',
            align: 'right' as const,
            render: (row: SpeakerProfile) => (
              <ViewPortalAsRowButton participantId={row.id} name={row.name} />
            ),
          },
        ]
      : []),
    {
      id: 'sessions',
      header: 'Sessions',
      width: '12%',
      render: (row) => (
        <span className={styles.personText}>
          <span className={styles.personMeta}>
            {row.acceptedSessions.length} accepted of {row.submissions}
          </span>
          {row.tasksOverdue > 0 ? (
            <Badge tone="danger">{row.tasksOverdue} overdue</Badge>
          ) : (
            <span className={styles.muted}>
              {row.tasksDone}/{row.tasksTotal} tasks
            </span>
          )}
        </span>
      ),
    },
  ];
}

/** `SPK-01` and `SPK-04`. Every control here narrows the same list, and the count says by how much. */
export function SpeakerRoster({
  speakers,
  statuses,
  canManage,
}: {
  speakers: SpeakerProfile[];
  statuses: StatusOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [facet, setFacet] = useState<Facet>('all');
  const [company, setCompany] = useState('');
  const [status, setStatus] = useState<SpeakerWorkflowStatus | ''>('');

  const companies = useMemo(
    () => [...new Set(speakers.map((row) => row.company).filter(Boolean))].sort() as string[],
    [speakers],
  );

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const labelOf = new Map(statuses.map((option) => [option.value, option.label]));
    return speakers.filter((row) => {
      if (!matchesFacet(row, facet)) return false;
      if (status && row.workflowStatus !== status) return false;
      if (company && row.company !== company) return false;
      return !needle || haystack(row, labelOf.get(row.workflowStatus) ?? '').includes(needle);
    });
  }, [speakers, query, facet, company, status, statuses]);

  const narrowed = rows.length !== speakers.length;

  return (
    <div>
      <div className={styles.toolbar}>
        <Input
          className={styles.search}
          inputSize="sm"
          type="search"
          value={query}
          placeholder="Search name, email, company, bio, dietary needs…"
          aria-label="Search speakers"
          onChange={(event) => setQuery(event.target.value)}
        />
        <Select
          selectSize="sm"
          value={status}
          aria-label="Filter by status"
          onChange={(event) => setStatus(event.target.value as SpeakerWorkflowStatus | '')}
        >
          <option value="">Any status</option>
          {statuses.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <Select
          selectSize="sm"
          value={company}
          aria-label="Filter by company"
          onChange={(event) => setCompany(event.target.value)}
        >
          <option value="">Any company</option>
          {companies.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
        <div className={styles.chips} role="group" aria-label="Filter speakers">
          {FACETS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={styles.chip}
              data-active={facet === entry.id}
              aria-pressed={facet === entry.id}
              onClick={() => setFacet(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <span className={styles.toolbarSpacer} />
        <span className={styles.resultCount} aria-live="polite">
          {narrowed
            ? `${rows.length} of ${speakers.length} speakers`
            : `${speakers.length} speaker${speakers.length === 1 ? '' : 's'}`}
        </span>
      </div>
      <DataTable
        label="Speakers"
        columns={columns(statuses, canManage)}
        rows={rows}
        getRowId={(row) => row.id}
        onRowActivate={(row) => router.push(`/admin/speakers/${row.id}`)}
        emptyState={
          speakers.length === 0
            ? 'No speakers yet. Add one manually or import a CSV.'
            : 'No speaker matches those filters.'
        }
      />
    </div>
  );
}
