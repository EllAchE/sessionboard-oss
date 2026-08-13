'use client';

import { useMemo, useState } from 'react';
import { Avatar, Badge, Card, CardBody, CardHeader, CardTitle, DataTable, Input } from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import type { SpeakerRow } from '@/lib/services/dashboard';
import styles from './dashboard.module.css';

function columns(): Array<DataTableColumn<SpeakerRow>> {
  return [
    {
      id: 'name',
      header: 'Speaker',
      width: '30%',
      render: (row) => (
        <div className={styles.person}>
          <Avatar name={row.name} size="sm" />
          <span className={styles.personText}>
            <span className={styles.personName}>{row.name}</span>
            <span className={styles.personMeta}>
              {[row.jobTitle, row.company].filter(Boolean).join(', ') || row.email}
            </span>
          </span>
        </div>
      ),
    },
    {
      id: 'profile',
      header: 'Profile',
      width: '20%',
      render: (row) => (
        <span className={styles.sessionList}>
          <Badge tone={row.hasBio ? 'success' : 'warning'}>{row.hasBio ? 'Bio' : 'No bio'}</Badge>
          <Badge tone={row.hasHeadshot ? 'success' : 'warning'}>
            {row.hasHeadshot ? 'Headshot' : 'No headshot'}
          </Badge>
        </span>
      ),
    },
    {
      id: 'sessions',
      header: 'Accepted',
      width: '28%',
      render: (row) =>
        row.acceptedSessions.length === 0 ? (
          <span className={styles.personMeta}>{row.submissions} submitted, none accepted</span>
        ) : (
          <span className={styles.personMeta}>{row.acceptedSessions.join(', ')}</span>
        ),
    },
    {
      id: 'tasks',
      header: 'Tasks',
      width: '22%',
      render: (row) => (
        <span className={styles.due}>
          <span className={styles.dueDate}>
            {row.tasksDone}/{row.tasksTotal} done
          </span>
          {row.tasksOverdue > 0 ? (
            <span className={styles.lateness} data-tone="danger">
              {row.tasksOverdue} overdue
            </span>
          ) : null}
        </span>
      ),
    },
  ];
}

export function SpeakerTable({ speakers }: { speakers: SpeakerRow[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'incomplete' | 'overdue'>('all');

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return speakers.filter((row) => {
      if (filter === 'incomplete' && row.hasBio && row.hasHeadshot) return false;
      if (filter === 'overdue' && row.tasksOverdue === 0) return false;
      if (!needle) return true;
      return (
        row.name.toLowerCase().includes(needle) ||
        row.email.toLowerCase().includes(needle) ||
        (row.company ?? '').toLowerCase().includes(needle)
      );
    });
  }, [speakers, query, filter]);

  return (
    <div>
      <div className={styles.toolbar}>
        <Input
          inputSize="sm"
          value={query}
          placeholder="Search speakers…"
          aria-label="Search speakers"
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className={styles.tabs}>
          {(
            [
              ['all', 'All'],
              ['incomplete', 'Incomplete profile'],
              ['overdue', 'Has overdue tasks'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={styles.tab}
              data-active={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className={styles.toolbarSpacer} />
        <span className={styles.filterLabel}>{rows.length} speakers</span>
      </div>
      <DataTable
        label="Speakers"
        columns={columns()}
        rows={rows}
        getRowId={(row) => row.id}
        emptyState="No speakers yet. They appear once a submission names them."
      />
    </div>
  );
}

export function SpeakerTrackingWidget({ speakers }: { speakers: SpeakerRow[] }) {
  return (
    <Card className={styles.wide}>
      <CardHeader>
        <CardTitle>Speaker tracking</CardTitle>
      </CardHeader>
      <CardBody>
        <SpeakerTable speakers={speakers} />
      </CardBody>
    </Card>
  );
}
