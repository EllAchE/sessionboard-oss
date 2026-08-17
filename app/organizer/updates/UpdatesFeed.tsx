'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  ListChecks,
  Paperclip,
  Users,
} from 'lucide-react';
import { Badge, Card, CardBody } from '@/components/ui';
import type {
  OrganizerUpdateCategory,
  OrganizerUpdateItem,
} from '@/lib/services/updates';
import styles from './updates.module.css';

type CategoryFilter = 'all' | OrganizerUpdateCategory;
type ScopeFilter = 'all' | 'unread';

const CATEGORIES: Array<{ id: CategoryFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'submissions', label: 'Submissions' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'speakers', label: 'Speakers' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'program', label: 'Program' },
  { id: 'files', label: 'Files' },
];

function CategoryIcon({ category }: { category: OrganizerUpdateCategory }) {
  switch (category) {
    case 'submissions':
      return <FileText size={16} aria-hidden />;
    case 'reviews':
      return <ClipboardCheck size={16} aria-hidden />;
    case 'speakers':
      return <Users size={16} aria-hidden />;
    case 'tasks':
      return <ListChecks size={16} aria-hidden />;
    case 'program':
      return <CalendarDays size={16} aria-hidden />;
    case 'files':
      return <Paperclip size={16} aria-hidden />;
  }
}

function categoryLabel(category: OrganizerUpdateCategory): string {
  return CATEGORIES.find((entry) => entry.id === category)?.label ?? category;
}

function validStoredDate(value: string | null, generatedAt: string): string | null {
  if (!value) return null;
  const stamp = Date.parse(value);
  if (!Number.isFinite(stamp) || stamp > Date.parse(generatedAt)) return null;
  return new Date(stamp).toISOString();
}

function relativeTime(iso: string, generatedAt: string): string {
  const elapsed = Math.max(0, Date.parse(generatedAt) - Date.parse(iso));
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function fullDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(iso));
}

function dayLabel(iso: string, generatedAt: string): string {
  const day = iso.slice(0, 10);
  const today = generatedAt.slice(0, 10);
  if (day === today) return 'Today';
  const yesterday = new Date(Date.parse(`${today}T00:00:00.000Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
  if (day === yesterday) return 'Yesterday';
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(iso));
}

function groupByDay(
  items: OrganizerUpdateItem[],
  generatedAt: string,
): Array<{ label: string; items: OrganizerUpdateItem[] }> {
  const groups = new Map<string, OrganizerUpdateItem[]>();
  for (const item of items) {
    const key = dayLabel(item.occurredAt, generatedAt);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].map(([label, grouped]) => ({ label, items: grouped }));
}

export function partitionUpdates(
  items: OrganizerUpdateItem[],
  lastSeen: string | null,
): { unread: OrganizerUpdateItem[]; viewed: OrganizerUpdateItem[] } {
  if (!lastSeen) return { unread: items, viewed: [] };
  const boundary = Date.parse(lastSeen);
  if (!Number.isFinite(boundary)) return { unread: items, viewed: [] };
  return {
    unread: items.filter((item) => Date.parse(item.occurredAt) > boundary),
    viewed: items.filter((item) => Date.parse(item.occurredAt) <= boundary),
  };
}

function TimelineSection({
  label,
  items,
  unread,
  generatedAt,
}: {
  label: string;
  items: OrganizerUpdateItem[];
  unread: boolean;
  generatedAt: string;
}) {
  if (items.length === 0) return null;
  const groups = groupByDay(items, generatedAt);

  return (
    <section className={styles.updateSection} data-unread={unread}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>{label}</h3>
        <span className={styles.sectionCount}>{items.length}</span>
      </div>
      <div className={styles.timeline}>
        {groups.map((group) => (
          <section key={group.label} className={styles.dayGroup}>
            <h4 className={styles.dayLabel}>{group.label}</h4>
            <ul className={styles.updateList}>
              {group.items.map((item) => (
                <li key={item.id} className={styles.updateItem} data-unread={unread}>
                  <span className={styles.icon} data-tone={item.tone}>
                    <CategoryIcon category={item.category} />
                  </span>
                  <Link href={item.href} className={styles.updateLink}>
                    <span className={styles.updateTopline}>
                      <span className={styles.updateTitle}>{item.title}</span>
                      <time
                        className={styles.updateTime}
                        dateTime={item.occurredAt}
                        title={fullDateTime(item.occurredAt)}
                      >
                        {relativeTime(item.occurredAt, generatedAt)}
                      </time>
                    </span>
                    <span className={styles.updateDetail}>{item.detail}</span>
                    <span className={styles.updateCategory}>{categoryLabel(item.category)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}

export function UpdatesFeed({
  actorId,
  eventId,
  eventName,
  items,
  windowStart,
  generatedAt,
}: {
  actorId: string;
  eventId: string;
  eventName: string;
  items: OrganizerUpdateItem[];
  windowStart: string;
  generatedAt: string;
}) {
  const storageKey = `cicero-updates-seen:${actorId}:${eventId}`;
  const recordedThisMount = useRef(false);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [scope, setScope] = useState<ScopeFilter>('all');
  const [category, setCategory] = useState<CategoryFilter>('all');

  useEffect(() => {
    // React Strict Mode replays effects in development. Do not let that replay turn the timestamp
    // written by the first pass into this visit's own "previous" check.
    if (recordedThisMount.current) return;
    recordedThisMount.current = true;
    let previous: string | null = null;
    try {
      previous = validStoredDate(window.localStorage.getItem(storageKey), generatedAt);
      window.localStorage.setItem(storageKey, generatedAt);
    } catch {
      // Private browsing and locked-down embeds may deny storage. The feed still works as recent.
    }
    setLastSeen(previous);
    setReady(true);
  }, [generatedAt, storageKey]);

  const partition = useMemo(
    () => partitionUpdates(items, lastSeen),
    [items, lastSeen],
  );

  const inScope = scope === 'unread' ? partition.unread : items;
  const visible =
    category === 'all' ? inScope : inScope.filter((item) => item.category === category);
  const visiblePartition = partitionUpdates(visible, lastSeen);
  const countFor = (id: CategoryFilter) =>
    id === 'all' ? inScope.length : inScope.filter((item) => item.category === id).length;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Notifications &amp; updates</p>
          <h1 className={styles.title}>{eventName}</h1>
          <p className={styles.subtitle}>
            A rundown of submissions, reviews, speakers, tasks, program changes, and files, all in
            one place.
          </p>
        </div>
        <Badge tone={partition.unread.length > 0 ? 'accent' : 'neutral'} size="md">
          {ready ? `${partition.unread.length} unread` : 'Checking…'}
        </Badge>
      </header>

      <div className={styles.summaryGrid}>
        <Card className={styles.summaryCard}>
          <CardBody>
            <span className={styles.summaryIcon} data-tone="accent">
              <Bell size={17} aria-hidden />
            </span>
            <span className={styles.summaryValue}>{partition.unread.length}</span>
            <span className={styles.summaryLabel}>Unread updates</span>
          </CardBody>
        </Card>
        <Card className={styles.summaryCard}>
          <CardBody>
            <span className={styles.summaryIcon} data-tone="info">
              <FileText size={17} aria-hidden />
            </span>
            <span className={styles.summaryValue}>
              {partition.unread.filter((item) => item.category === 'submissions').length}
            </span>
            <span className={styles.summaryLabel}>Submission changes</span>
          </CardBody>
        </Card>
        <Card className={styles.summaryCard}>
          <CardBody>
            <span className={styles.summaryIcon} data-tone="success">
              <CheckCircle2 size={17} aria-hidden />
            </span>
            <span className={styles.summaryValue}>
              {
                partition.unread.filter(
                  (item) => item.category === 'reviews' || item.category === 'tasks',
                ).length
              }
            </span>
            <span className={styles.summaryLabel}>Reviews &amp; tasks</span>
          </CardBody>
        </Card>
        <Card className={styles.summaryCard}>
          <CardBody>
            <span className={styles.summaryIcon} data-tone="warning">
              <CalendarDays size={17} aria-hidden />
            </span>
            <span className={styles.summaryValue}>
              {partition.unread.filter((item) => item.category === 'program').length}
            </span>
            <span className={styles.summaryLabel}>Program changes</span>
          </CardBody>
        </Card>
      </div>

      <section className={styles.feedCard} aria-labelledby="updates-heading">
        <div className={styles.feedHeader}>
          <div>
            <h2 id="updates-heading" className={styles.feedTitle}>
              Update feed
            </h2>
            <p className={styles.feedHint}>
              {!ready
                ? 'Checking when this browser last opened the feed…'
                : lastSeen
                  ? `Last checked ${fullDateTime(lastSeen)}. Unread updates appear first; opening this page marks them checked for your next visit on this browser.`
                  : `First check on this browser. Showing activity since ${fullDateTime(windowStart)}.`}
            </p>
          </div>
          <div className={styles.scopeTabs} aria-label="Update range">
            <button
              type="button"
              className={styles.scopeTab}
              data-active={scope === 'all'}
              aria-pressed={scope === 'all'}
              onClick={() => setScope('all')}
            >
              All updates
            </button>
            <button
              type="button"
              className={styles.scopeTab}
              data-active={scope === 'unread'}
              aria-pressed={scope === 'unread'}
              onClick={() => setScope('unread')}
            >
              Unread only
            </button>
          </div>
        </div>

        <div className={styles.filters} aria-label="Filter updates by category">
          {CATEGORIES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={styles.filter}
              data-active={category === entry.id}
              aria-pressed={category === entry.id}
              onClick={() => setCategory(entry.id)}
            >
              {entry.label}
              <span className={styles.filterCount}>{countFor(entry.id)}</span>
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <div className={styles.empty}>
            <CheckCircle2 size={24} aria-hidden />
            <h3>Nothing new here</h3>
            <p>
              {scope === 'unread'
                ? 'You are caught up for this category. Switch to All updates to review earlier activity.'
                : 'No activity in this category during the current 30-day window.'}
            </p>
          </div>
        ) : (
          <>
            <TimelineSection
              label="Unread"
              items={visiblePartition.unread}
              unread
              generatedAt={generatedAt}
            />
            {scope === 'all' ? (
              <TimelineSection
                label="Earlier"
                items={visiblePartition.viewed}
                unread={false}
                generatedAt={generatedAt}
              />
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
