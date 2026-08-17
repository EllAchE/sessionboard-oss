'use client';

import { useMemo, useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { AlertTriangle, CalendarOff, Users } from 'lucide-react';
import {
  DEFAULT_GRID,
  blockGeometry,
  buildSlots,
  entriesForDay,
  formatZonedRange,
  gridForDay,
  worstSeverity,
  type Conflict,
  type GridOptions,
  type QueueItem,
  type ScheduleEntry,
} from '@/lib/services/schedule';
import type { NamedRoom } from './wire';
import styles from './agenda.module.css';

/**
 * The grid itself: rooms across, time down. Each cell is a droppable identified by
 * `cell:<roomId>:<minute>:<dayKey>`, which is all the drop handler needs to reconstruct a placement.
 */

export type DragPayload =
  | { source: 'queue'; item: QueueItem }
  | { source: 'grid'; entry: ScheduleEntry };

export function cellId(roomId: string, minute: number, dayKey?: string): string {
  return dayKey ? `cell:${roomId}:${minute}:${dayKey}` : `cell:${roomId}:${minute}`;
}

/**
 * The day is part of the id so a drop carries its conference date with it. It also keeps cell ids
 * unambiguous if more than one day grid is ever mounted inside the shared `DndContext`.
 */
export function parseCellId(
  id: string,
): { roomId: string; minute: number; dayKey: string | null } | null {
  const parts = id.split(':');
  if (parts[0] !== 'cell' || (parts.length !== 3 && parts.length !== 4)) return null;
  const minute = Number(parts[2]);
  if (!Number.isFinite(minute)) return null;
  return { roomId: parts[1], minute, dayKey: parts[3] ?? null };
}

function QueueCard({
  item,
  conflictCount,
  onSchedule,
}: {
  item: QueueItem;
  conflictCount?: number;
  onSchedule: (item: QueueItem) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `queue:${item.kind}:${item.id}`,
    data: { source: 'queue', item } satisfies DragPayload,
  });

  return (
    <div
      ref={setNodeRef}
      className={`${styles.card} ${isDragging ? styles.cardDragging : ''}`}
      {...listeners}
      {...attributes}
    >
      <span className={styles.cardRef}>{item.ref}</span>
      <span className={styles.cardTitle}>{item.title}</span>
      <span className={styles.cardMeta}>
        <span>{item.durationMinutes} min</span>
        {item.speakers.length > 0 && (
          <span>
            <Users size={11} aria-hidden /> {item.speakers.map((s) => s.name).join(', ')}
          </span>
        )}
        {conflictCount ? <span>{conflictCount} clash</span> : null}
      </span>
      <button
        type="button"
        className={styles.cardAction}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onSchedule(item);
        }}
      >
        Schedule
      </button>
    </div>
  );
}

export function UnscheduledRail({
  queue,
  onSchedule,
}: {
  queue: QueueItem[];
  onSchedule: (item: QueueItem) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'rail' });

  return (
    <aside ref={setNodeRef} className={`${styles.rail} ${isOver ? styles.railActive : ''}`}>
      <div className={styles.railHeader}>
        <h2 className={styles.railTitle}>Unscheduled</h2>
        <span className={styles.railHint}>{queue.length}</span>
      </div>
      <p className={styles.railHint}>
        Unscheduled accepted talks. Drag onto the grid; drag back to unschedule.
      </p>
      {queue.length === 0 ? (
        <p className={styles.railEmpty}>Everything accepted has a slot.</p>
      ) : (
        queue.map((item) => (
          <QueueCard key={`${item.kind}:${item.id}`} item={item} onSchedule={onSchedule} />
        ))
      )}
    </aside>
  );
}

function Block({
  entry,
  timeZone,
  grid,
  column,
  conflicts,
  onOpen,
}: {
  entry: ScheduleEntry & { startsAt: Date; endsAt: Date };
  timeZone: string;
  grid: GridOptions;
  column: number;
  conflicts: Conflict[];
  onOpen: (entry: ScheduleEntry) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `block:${entry.id}`,
    data: { source: 'grid', entry } satisfies DragPayload,
  });

  const { offsetSlots, spanSlots } = blockGeometry(entry, timeZone, grid);
  const severity = worstSeverity(conflicts);
  /**
   * The block is small and gets one line, so it names the worst thing rather than everything. A
   * person in two places at once beats a speaker-declared window, which beats a bare count.
   */
  const speakerClash = conflicts.some((conflict) => conflict.kind === 'speaker');
  const unavailable = conflicts.some((conflict) => conflict.kind === 'availability');

  /**
   * Space now belongs to the `KeyboardSensor`, which lifts the block so the arrows can move it, so
   * it has to reach dnd-kit's own listener. Enter is handled here and goes no further: opening the
   * session is what Enter did before the block could be lifted, and it stays that way.
   */
  const liftKey = listeners?.onKeyDown as
    | ((fired: React.KeyboardEvent<HTMLDivElement>) => void)
    | undefined;

  const onKeyDown = (fired: React.KeyboardEvent<HTMLDivElement>) => {
    if (fired.key === 'Enter') {
      fired.preventDefault();
      onOpen(entry);
      return;
    }
    liftKey?.(fired);
  };

  return (
    <div
      ref={setNodeRef}
      onClick={() => onOpen(entry)}
      className={[
        styles.block,
        isDragging ? styles.blockDragging : '',
        entry.status === 'published' ? styles.blockPublished : '',
        entry.status === 'cancelled' ? styles.blockCancelled : '',
        severity === 'error' ? styles.blockConflictError : '',
        severity === 'warning' ? styles.blockConflictWarning : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        gridColumn: column,
        gridRow: `${offsetSlots + 2} / span ${spanSlots}`,
      }}
      data-compact={spanSlots <= 3}
      aria-label={`${entry.title}, ${formatZonedRange(entry.startsAt, entry.endsAt, timeZone)}`}
      {...listeners}
      {...attributes}
      onKeyDown={onKeyDown}
    >
      <span className={styles.blockTime}>
        {formatZonedRange(entry.startsAt, entry.endsAt, timeZone)}
      </span>
      <span className={styles.blockTitle}>{entry.title}</span>
      {entry.speakers.length > 0 && (
        <span className={styles.blockSpeakers}>
          {entry.speakers.map((speaker) => speaker.name).join(', ')}
        </span>
      )}
      {severity && (
        <span className={styles.blockFlag}>
          {unavailable && !speakerClash ? (
            <CalendarOff size={11} aria-hidden />
          ) : (
            <AlertTriangle size={11} aria-hidden />
          )}
          {speakerClash
            ? 'Speaker clash'
            : unavailable
              ? 'Speaker unavailable'
              : `${conflicts.length} conflict`}
        </span>
      )}
    </div>
  );
}

function Cell({
  roomId,
  minute,
  dayKey,
  column,
  row,
  major,
}: {
  roomId: string;
  minute: number;
  dayKey: string;
  column: number;
  row: number;
  major: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: cellId(roomId, minute, dayKey) });

  return (
    <div
      ref={setNodeRef}
      className={[styles.cell, major ? styles.cellMajor : '', isOver ? styles.cellOver : '']
        .filter(Boolean)
        .join(' ')}
      style={{ gridColumn: column, gridRow: row }}
    />
  );
}

export function DayGrid({
  entries,
  rooms,
  dayKey,
  timeZone,
  conflictsBySessionId,
  onOpen,
  slotHeight = 18,
}: {
  entries: ScheduleEntry[];
  rooms: NamedRoom[];
  dayKey: string;
  timeZone: string;
  conflictsBySessionId: Map<string, Conflict[]>;
  onOpen: (entry: ScheduleEntry) => void;
  slotHeight?: number;
}) {
  const grid = useMemo(
    () => gridForDay(entries, dayKey, timeZone, DEFAULT_GRID),
    [entries, dayKey, timeZone],
  );
  const slots = useMemo(() => buildSlots(grid), [grid]);
  const onDay = useMemo(
    () => entriesForDay(entries, dayKey, timeZone),
    [entries, dayKey, timeZone],
  );

  if (rooms.length === 0) {
    return (
      <div className={styles.gridWrap}>
        <p className={styles.noRooms}>
          Add a room in Settings before scheduling.
        </p>
      </div>
    );
  }

  return (
    <>
      <div
        className={styles.gridWrap}
        role="region"
        tabIndex={0}
        aria-label={`Schedule for ${dayKey}, ${rooms.length} rooms`}
      >
        <div
          className={styles.grid}
          style={{
            gridTemplateColumns: `64px repeat(${rooms.length}, minmax(150px, 1fr))`,
            gridTemplateRows: `auto repeat(${slots.length}, ${slotHeight}px)`,
          }}
        >
          <div className={styles.gutterHead} style={{ gridColumn: 1, gridRow: 1 }} />
          {rooms.map((room, index) => (
            <div
              key={room.id}
              className={styles.roomHead}
              style={{ gridColumn: index + 2, gridRow: 1 }}
            >
              <span className={styles.roomName}>{room.name}</span>
              {room.capacity ? (
                <span className={styles.roomMeta}>seats {room.capacity}</span>
              ) : null}
            </div>
          ))}

          {slots.map((slot, rowIndex) => (
            <div
              key={`label:${slot.minute}`}
              className={`${styles.timeLabel} ${slot.major ? '' : styles.timeLabelMinor}`}
              style={{ gridRow: rowIndex + 2 }}
            >
              {slot.label}
            </div>
          ))}

          {rooms.map((room, columnIndex) =>
            slots.map((slot, rowIndex) => (
              <Cell
                key={`${room.id}:${slot.minute}`}
                roomId={room.id}
                minute={slot.minute}
                dayKey={dayKey}
                column={columnIndex + 2}
                row={rowIndex + 2}
                major={slot.major}
              />
            )),
          )}

          {onDay.map((entry) => {
            const columnIndex = rooms.findIndex((room) => room.id === entry.roomId);
            if (columnIndex === -1) return null;
            return (
              <Block
                key={entry.id}
                entry={entry}
                timeZone={timeZone}
                grid={grid}
                column={columnIndex + 2}
                conflicts={conflictsBySessionId.get(entry.id) ?? []}
                onOpen={onOpen}
              />
            );
          })}
        </div>
      </div>
    </>
  );
}

/** Blocks whose room was deleted would otherwise vanish from the grid entirely. */
export function OrphanedNotice({
  entries,
  rooms,
  dayKey,
  timeZone,
}: {
  entries: ScheduleEntry[];
  rooms: NamedRoom[];
  dayKey: string;
  timeZone: string;
}) {
  const [dismissed, setDismissed] = useState(false);
  const roomIds = new Set(rooms.map((room) => room.id));
  const orphans = entriesForDay(entries, dayKey, timeZone).filter(
    (entry) => !entry.roomId || !roomIds.has(entry.roomId),
  );

  if (dismissed || orphans.length === 0) return null;

  return (
    <div className={`${styles.banner} ${styles.bannerWarning}`}>
      <AlertTriangle size={15} aria-hidden />
      <span>
        {orphans.length} session{orphans.length === 1 ? '' : 's'} on this day{' '}
        {orphans.length === 1 ? 'has' : 'have'} a time but no room, so {orphans.length === 1 ? 'it is' : 'they are'} not on
        the grid. Open the list view to give {orphans.length === 1 ? 'it' : 'them'} one.
      </span>
      <button type="button" className={styles.viewButton} onClick={() => setDismissed(true)}>
        Dismiss
      </button>
    </div>
  );
}
