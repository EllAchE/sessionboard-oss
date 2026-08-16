'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarX2, Users } from 'lucide-react';
import { Badge, Switch } from '@/components/ui';
import {
  entriesForDay,
  formatDayLabel,
  formatZonedRange,
  isPlaced,
  monthGrid,
  zonedDayKey,
  type Conflict,
  type ConflictPolicy,
  type ScheduleEntry,
} from '@/lib/services/schedule';
import type { NamedRoom, NamedTrack } from './wire';
import styles from './agenda.module.css';

/** `A-3` list / room / track views, the `A-2` conflicts view, and the `A-9` month view. */

type Labels = { rooms: Record<string, string>; tracks: Record<string, string> };

function statusTone(status: ScheduleEntry['status']) {
  if (status === 'published') return 'success' as const;
  if (status === 'cancelled') return 'neutral' as const;
  return 'warning' as const;
}

function Row({
  entry,
  timeZone,
  labels,
  conflicts,
  onOpen,
}: {
  entry: ScheduleEntry;
  timeZone: string;
  labels: Labels;
  conflicts: Conflict[];
  onOpen: (entry: ScheduleEntry) => void;
}) {
  return (
    <div
      className={styles.listRow}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(entry)}
      onKeyDown={(fired) => {
        if (fired.key === 'Enter') onOpen(entry);
      }}
    >
      <span className={styles.listTime}>
        {isPlaced(entry) ? formatZonedRange(entry.startsAt, entry.endsAt, timeZone) : 'Unscheduled'}
      </span>
      <span className={styles.listTitle}>
        {entry.title}
        {conflicts.length > 0 && (
          <>
            {' '}
            <AlertTriangle size={12} aria-hidden />
          </>
        )}
      </span>
      <span className={styles.listMuted}>
        {entry.roomId ? (labels.rooms[entry.roomId] ?? 'Unknown room') : 'No room'}
      </span>
      <span className={styles.listMuted}>
        {entry.trackId ? (labels.tracks[entry.trackId] ?? 'Unknown track') : 'No track'}
      </span>
      <Badge tone={statusTone(entry.status)}>{entry.status}</Badge>
    </div>
  );
}

export function ListView({
  entries,
  timeZone,
  labels,
  conflictsBySessionId,
  onOpen,
}: {
  entries: ScheduleEntry[];
  timeZone: string;
  labels: Labels;
  conflictsBySessionId: Map<string, Conflict[]>;
  onOpen: (entry: ScheduleEntry) => void;
}) {
  const groups = useMemo(() => {
    const byDay = new Map<string, ScheduleEntry[]>();
    for (const entry of entries) {
      const key = isPlaced(entry) ? zonedDayKey(entry.startsAt, timeZone) : 'unscheduled';
      byDay.set(key, [...(byDay.get(key) ?? []), entry]);
    }
    return [...byDay.entries()].sort(([a], [b]) =>
      a === 'unscheduled' ? 1 : b === 'unscheduled' ? -1 : a.localeCompare(b),
    );
  }, [entries, timeZone]);

  if (entries.length === 0) {
    return <p className={styles.railEmpty}>No sessions yet.</p>;
  }

  return (
    <div className={styles.panel}>
      {groups.map(([dayKey, rows]) => (
        <div key={dayKey}>
          <h3 className={styles.groupTitle}>
            {dayKey === 'unscheduled' ? 'Waiting for a slot' : formatDayLabel(dayKey, timeZone)}
          </h3>
          {rows
            .slice()
            .sort((a, b) => {
              if (!isPlaced(a)) return 1;
              if (!isPlaced(b)) return -1;
              return a.startsAt.getTime() - b.startsAt.getTime();
            })
            .map((entry) => (
              <Row
                key={entry.id}
                entry={entry}
                timeZone={timeZone}
                labels={labels}
                conflicts={conflictsBySessionId.get(entry.id) ?? []}
                onOpen={onOpen}
              />
            ))}
        </div>
      ))}
    </div>
  );
}

/** `A-3` room and track views: the same rows, grouped by the axis an organizer is checking. */
export function GroupedView({
  entries,
  timeZone,
  labels,
  groupBy,
  rooms,
  tracks,
  conflictsBySessionId,
  onOpen,
}: {
  entries: ScheduleEntry[];
  timeZone: string;
  labels: Labels;
  groupBy: 'room' | 'track';
  rooms: NamedRoom[];
  tracks: NamedTrack[];
  conflictsBySessionId: Map<string, Conflict[]>;
  onOpen: (entry: ScheduleEntry) => void;
}) {
  const buckets = groupBy === 'room' ? rooms : tracks;

  const groups = buckets.map((bucket) => ({
    id: bucket.id,
    name: bucket.name,
    rows: entries
      .filter((entry) => (groupBy === 'room' ? entry.roomId : entry.trackId) === bucket.id)
      .sort((a, b) => {
        if (!isPlaced(a)) return 1;
        if (!isPlaced(b)) return -1;
        return a.startsAt.getTime() - b.startsAt.getTime();
      }),
  }));

  const unassigned = entries.filter(
    (entry) => !(groupBy === 'room' ? entry.roomId : entry.trackId),
  );
  const [selectedGroupId, setSelectedGroupId] = useState(
    () => groups[0]?.id ?? (unassigned.length > 0 ? 'unassigned' : ''),
  );
  const selectableGroups = [
    ...groups.map((group) => ({ id: group.id, name: group.name, count: group.rows.length })),
    ...(unassigned.length > 0
      ? [{ id: 'unassigned', name: `No ${groupBy}`, count: unassigned.length }]
      : []),
  ];
  const activeGroupId = selectableGroups.some((group) => group.id === selectedGroupId)
    ? selectedGroupId
    : (selectableGroups[0]?.id ?? '');
  const showMobilePicker = groupBy === 'track' && selectableGroups.length > 1;

  return (
    <div className={styles.panel}>
      {showMobilePicker ? (
        <label className={styles.groupPicker}>
          <span className={styles.groupPickerLabel}>Track</span>
          <select
            className={styles.groupPickerSelect}
            value={activeGroupId}
            onChange={(event) => setSelectedGroupId(event.target.value)}
          >
            {selectableGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name} ({group.count})
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {groups.map((group) => (
        <section
          key={group.id}
          className={styles.groupSection}
          data-mobile-active={!showMobilePicker || group.id === activeGroupId}
        >
          <h3 className={styles.groupTitle}>
            {group.name} <span className={styles.listMuted}>({group.rows.length})</span>
          </h3>
          {group.rows.length === 0 ? (
            <p className={styles.listMuted}>Nothing scheduled here.</p>
          ) : (
            group.rows.map((entry) => (
              <Row
                key={entry.id}
                entry={entry}
                timeZone={timeZone}
                labels={labels}
                conflicts={conflictsBySessionId.get(entry.id) ?? []}
                onOpen={onOpen}
              />
            ))
          )}
        </section>
      ))}
      {unassigned.length > 0 && (
        <section
          className={styles.groupSection}
          data-mobile-active={!showMobilePicker || activeGroupId === 'unassigned'}
        >
          <h3 className={styles.groupTitle}>No {groupBy}</h3>
          {unassigned.map((entry) => (
            <Row
              key={entry.id}
              entry={entry}
              timeZone={timeZone}
              labels={labels}
              conflicts={conflictsBySessionId.get(entry.id) ?? []}
              onOpen={onOpen}
            />
          ))}
        </section>
      )}
    </div>
  );
}

/**
 * `A-2`'s dedicated conflicts view: every clash on the whole agenda, worst first, and — since
 * `AR-30` — the switch that decides whether a clash refuses the save at all.
 *
 * The switch lives here rather than in event settings because this is the screen an organizer is
 * already on when the rule starts to matter, and because the list underneath it is the evidence for
 * the decision. Room and speaker clashes are the only blockable kinds; the copy says so, so nobody
 * flips the switch expecting it to police track collisions too.
 */
export function ConflictsView({
  conflicts,
  entries,
  timeZone,
  onOpen,
  policy,
  canManage,
  onPolicyChange,
  onUnschedule,
}: {
  conflicts: Conflict[];
  entries: ScheduleEntry[];
  timeZone: string;
  onOpen: (entry: ScheduleEntry) => void;
  policy: ConflictPolicy;
  canManage: boolean;
  onPolicyChange: (policy: ConflictPolicy) => void;
  onUnschedule: (entry: ScheduleEntry) => void;
}) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const ordered = [...conflicts].sort((a, b) =>
    a.severity === b.severity ? a.kind.localeCompare(b.kind) : a.severity === 'error' ? -1 : 1,
  );

  const control = (
    <div className={styles.policyBar}>
      <div className={styles.policyText}>
        <span className={styles.policyTitle}>Block clashes on save</span>
        <span className={styles.policyHint}>
          {policy === 'block'
            ? 'A room or speaker double-booking is refused. Track collisions are still allowed, and still listed here.'
            : 'Clashes are saved and listed here as warnings. Turn this on to refuse room and speaker double-bookings outright.'}
        </span>
      </div>
      <Switch
        checked={policy === 'block'}
        disabled={!canManage}
        aria-label="Block clashes on save"
        onCheckedChange={(checked) => onPolicyChange(checked ? 'block' : 'warn')}
      />
    </div>
  );

  if (ordered.length === 0) {
    return (
      <div className={styles.panel}>
        {control}
        <p className={styles.railEmpty}>
          No room, track or speaker clashes on this agenda. Back-to-back sessions are not clashes.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      {control}
      {ordered.map((conflict) => {
        const first = byId.get(conflict.sessionIds[0]);
        return (
          <div
            key={`${conflict.kind}:${conflict.subjectId}:${conflict.sessionIds.join('|')}`}
            className={`${styles.conflictRow} ${
              conflict.severity === 'error' ? styles.conflictError : styles.conflictWarning
            }`}
          >
            {conflict.kind === 'speaker' ? (
              <Users size={16} aria-hidden />
            ) : (
              <AlertTriangle size={16} aria-hidden />
            )}
            <div className={styles.conflictBody}>
              <span className={styles.conflictMessage}>{conflict.message}</span>
              <span className={styles.conflictMeta}>
                {conflict.kind === 'speaker'
                  ? 'Speaker double-booking'
                  : conflict.kind === 'room'
                    ? 'Room double-booking'
                    : 'Track collision'}
                {first && isPlaced(first)
                  ? ` · ${formatZonedRange(first.startsAt, first.endsAt, timeZone)}`
                  : ''}
              </span>
              <span className={styles.detailActions}>
                {conflict.sessionIds.map((sessionId) => {
                  const entry = byId.get(sessionId);
                  if (!entry) return null;
                  return (
                    <button
                      key={sessionId}
                      type="button"
                      className={styles.viewButton}
                      onClick={() => onOpen(entry)}
                    >
                      Open {entry.title}
                    </button>
                  );
                })}
                {/*
                  The one-click fix. Returning either side to the unscheduled rail resolves any
                  clash of any kind without asking the organizer to first work out which slot is
                  free — and it is lossless, because the rail is where the session came from.
                */}
                {canManage &&
                  conflict.sessionIds.map((sessionId) => {
                    const entry = byId.get(sessionId);
                    if (!entry || !isPlaced(entry)) return null;
                    return (
                      <button
                        key={`unschedule:${sessionId}`}
                        type="button"
                        className={styles.resolveButton}
                        onClick={() => onUnschedule(entry)}
                      >
                        Unschedule {entry.title}
                      </button>
                    );
                  })}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** `A-9` month view. Useful for a multi-week programme where day tabs stop scaling. */
export function MonthView({
  entries,
  timeZone,
  anchorKey,
  onSelectDay,
}: {
  entries: ScheduleEntry[];
  timeZone: string;
  anchorKey: string;
  onSelectDay: (dayKey: string) => void;
}) {
  const { weeks, monthKey } = useMemo(() => monthGrid(anchorKey), [anchorKey]);

  return (
    <div className={styles.panel}>
      <h3 className={styles.groupTitle}>{monthKey}</h3>
      <div className={styles.monthGrid}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
          <span key={day} className={styles.monthHead}>
            {day}
          </span>
        ))}
        {weeks.flat().map((dayKey) => {
          const rows = entriesForDay(entries, dayKey, timeZone);
          const inMonth = dayKey.startsWith(monthKey);
          return (
            <button
              key={dayKey}
              type="button"
              onClick={() => onSelectDay(dayKey)}
              className={`${styles.monthCell} ${inMonth ? '' : styles.monthCellMuted}`}
            >
              <span className={styles.monthDay}>{dayKey.slice(8)}</span>
              {rows.slice(0, 3).map((entry) => (
                <span key={entry.id} className={styles.monthPill}>
                  {entry.title}
                </span>
              ))}
              {rows.length > 3 && (
                <span className={styles.monthPill}>+{rows.length - 3} more</span>
              )}
              {rows.length === 0 && inMonth && (
                <span className={styles.monthDay}>
                  <CalendarX2 size={11} aria-hidden />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
