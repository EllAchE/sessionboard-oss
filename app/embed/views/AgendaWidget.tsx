'use client';

import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  durationMinutes,
  formatClock,
  formatFullDateTime,
  formatShortDay,
  formatTimeRange,
  groupByDay,
  minuteOfDay,
  type AgendaDay,
  type EmbedOptions,
  type PublicBundle,
  type PublicSession,
} from '../model';
import { SessionChips, ShowMore, SpeakerRoster } from './parts';
import styles from '../embed.module.css';

/** One row of the grid is a quarter hour; the gutter is labelled on the half hour. */
const ROW_MINUTES = 15;
const LABEL_MINUTES = 30;
const UNASSIGNED = 'Unassigned';

type Placement = {
  session: PublicSession;
  column: number;
  startRow: number;
  endRow: number;
  lane: number;
  lanes: number;
  startsAtMinute: number;
  endsAtMinute: number;
};

type DayLayout = {
  columns: string[];
  gridStart: number;
  gridEnd: number;
  placements: Placement[];
  undated: PublicSession[];
};

/**
 * Two sessions sharing a room and an hour would otherwise draw on top of each other. Greedy lane
 * assignment splits the column instead, which keeps both readable without a second grid pass.
 */
function assignLanes(entries: Placement[]): void {
  const laneEnds: number[] = [];
  for (const entry of entries) {
    let lane = laneEnds.findIndex((end) => end <= entry.startsAtMinute);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(entry.endsAtMinute);
    } else {
      laneEnds[lane] = entry.endsAtMinute;
    }
    entry.lane = lane;
  }
  const total = Math.max(laneEnds.length, 1);
  for (const entry of entries) entry.lanes = total;
}

function layoutFor(day: AgendaDay, timezone: string, roomOrder: string[]): DayLayout {
  const dated = day.sessions.filter((session) => session.startsAt);
  const undated = day.sessions.filter((session) => !session.startsAt);

  const used = new Set(dated.map((session) => session.room ?? UNASSIGNED));
  const columns = [
    ...roomOrder.filter((room) => used.has(room)),
    ...[...used].filter((room) => !roomOrder.includes(room)).sort((a, b) => a.localeCompare(b)),
  ];
  if (columns.length === 0) columns.push(UNASSIGNED);

  const placements: Placement[] = dated.map((session) => {
    const startsAtMinute = minuteOfDay(session.startsAt as string, timezone);
    const endsAtMinute = startsAtMinute + durationMinutes(session, 60);
    return {
      session,
      column: Math.max(columns.indexOf(session.room ?? UNASSIGNED), 0),
      startRow: 0,
      endRow: 0,
      lane: 0,
      lanes: 1,
      startsAtMinute,
      endsAtMinute,
    };
  });

  const earliest = placements.reduce(
    (min, entry) => Math.min(min, entry.startsAtMinute),
    placements.length > 0 ? Number.POSITIVE_INFINITY : 9 * 60,
  );
  const latest = placements.reduce(
    (max, entry) => Math.max(max, entry.endsAtMinute),
    placements.length > 0 ? 0 : 17 * 60,
  );

  const gridStart = Math.floor(earliest / LABEL_MINUTES) * LABEL_MINUTES;
  const gridEnd = Math.max(
    Math.ceil(latest / LABEL_MINUTES) * LABEL_MINUTES,
    gridStart + LABEL_MINUTES * 2,
  );

  for (const entry of placements) {
    entry.startRow = 2 + Math.round((entry.startsAtMinute - gridStart) / ROW_MINUTES);
    entry.endRow = Math.max(
      entry.startRow + 2,
      2 + Math.round((entry.endsAtMinute - gridStart) / ROW_MINUTES),
    );
  }

  for (let column = 0; column < columns.length; column += 1) {
    const inColumn = placements
      .filter((entry) => entry.column === column)
      .sort((a, b) => a.startsAtMinute - b.startsAtMinute);
    assignLanes(inColumn);
  }

  return { columns, gridStart, gridEnd, placements, undated };
}

/** `EMB-06`, `EMB-07`, `EMB-08`. */
export function AgendaWidget({
  bundle,
  options,
}: {
  bundle: PublicBundle;
  options: EmbedOptions;
}) {
  const days = useMemo(
    () => groupByDay(bundle.sessions, bundle.event.timezone),
    [bundle.sessions, bundle.event.timezone],
  );

  const initialDay = days.findIndex((day) => day.date === options.day);
  const [dayIndex, setDayIndex] = useState(initialDay === -1 ? 0 : initialDay);
  const [openId, setOpenId] = useState<string | null>(null);

  const roomOrder = useMemo(
    () => [...bundle.rooms.map((room) => room.name)].sort((a, b) => a.localeCompare(b)),
    [bundle.rooms],
  );

  const activeIndex = Math.min(dayIndex, Math.max(days.length - 1, 0));
  const day = days[activeIndex];
  const layout = useMemo(
    () => (day ? layoutFor(day, bundle.event.timezone, roomOrder) : null),
    [day, bundle.event.timezone, roomOrder],
  );

  const open = openId ? bundle.sessions.find((session) => session.id === openId) : undefined;

  if (days.length === 0 || !day || !layout) {
    return <p className={styles.empty}>The schedule has not been published yet.</p>;
  }

  if (open) {
    return (
      <div>
        <div className={styles.backRow}>
          <button type="button" className={styles.controlButton} onClick={() => setOpenId(null)}>
            <ArrowLeft size={14} aria-hidden />
            Back to agenda
          </button>
        </div>
        <div className={styles.detail}>
          <h2 className={styles.detailName}>{open.title}</h2>
          <div className={styles.detailSection}>
            <span className={styles.detailSectionTitle}>When and where</span>
            <p className={styles.truncated}>{formatFullDateTime(open, bundle.event.timezone)}</p>
            <p className={styles.truncated}>Room: {open.room ?? 'To be announced'}</p>
            <p className={styles.truncated}>Format: {open.format ?? 'Not specified'}</p>
            <p className={styles.truncated}>Track: {open.track ?? 'Not specified'}</p>
          </div>
          {open.speakers.length > 0 ? (
            <div className={styles.detailSection}>
              <span className={styles.detailSectionTitle}>Speakers</span>
              <SpeakerRoster session={open} />
            </div>
          ) : null}
          <div className={styles.detailSection}>
            <span className={styles.detailSectionTitle}>Description</span>
            {open.descriptionHtml ? (
              <div
                className={styles.prose}
                dangerouslySetInnerHTML={{ __html: open.descriptionHtml }}
              />
            ) : (
              <p className={styles.speakerRole}>No description has been published yet.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const labelRows: number[] = [];
  for (let minute = layout.gridStart; minute <= layout.gridEnd; minute += LABEL_MINUTES) {
    labelRows.push(minute);
  }

  return (
    <div>
      <div className={styles.agendaBar}>
        <h2 className={styles.dayHeading}>{day.label}</h2>
        <button
          type="button"
          className={styles.controlButton}
          aria-label="Previous day"
          disabled={activeIndex === 0}
          onClick={() => setDayIndex(Math.max(activeIndex - 1, 0))}
        >
          <ChevronLeft size={14} aria-hidden />
        </button>
        <button
          type="button"
          className={styles.controlButton}
          aria-label="Next day"
          disabled={activeIndex >= days.length - 1}
          onClick={() => setDayIndex(Math.min(activeIndex + 1, days.length - 1))}
        >
          <ChevronRight size={14} aria-hidden />
        </button>
      </div>

      <div className={styles.dayTabs} role="tablist" aria-label="Event days">
        {days.map((entry, index) => (
          <button
            key={entry.date}
            type="button"
            role="tab"
            className={styles.dayTab}
            aria-selected={index === activeIndex}
            onClick={() => setDayIndex(index)}
          >
            {entry.date === 'tbd' ? 'To be announced' : formatShortDay(
              entry.sessions.find((session) => session.startsAt)?.startsAt ?? entry.date,
              bundle.event.timezone,
            )}
          </button>
        ))}
      </div>

      <div className={styles.gridScroll}>
        <div
          className={styles.grid}
          style={{ '--agenda-columns': layout.columns.length } as CSSProperties}
        >
          <div className={styles.gridGutterHead} />
          {layout.columns.map((room, index) => (
            <div key={room} className={styles.gridHeadCell} style={{ gridColumn: index + 2 }}>
              {room}
            </div>
          ))}

          {labelRows.map((minute) => {
            const row = 2 + (minute - layout.gridStart) / ROW_MINUTES;
            return (
              <div key={`rule-${minute}`} className={styles.gridRule} style={{ gridRow: row }} />
            );
          })}

          {labelRows.map((minute) => {
            const row = 2 + (minute - layout.gridStart) / ROW_MINUTES;
            return (
              <span
                key={`time-${minute}`}
                className={styles.gridTime}
                style={{ gridRow: `${row} / span 2` }}
              >
                {formatClock(minute)}
              </span>
            );
          })}

          {layout.placements.map((entry) => (
            <button
              key={entry.session.id}
              type="button"
              className={styles.block}
              id={`session-${entry.session.ref}`}
              style={
                {
                  gridColumn: entry.column + 2,
                  gridRow: `${entry.startRow} / ${entry.endRow}`,
                  '--lane': entry.lane,
                  '--lanes': entry.lanes,
                } as CSSProperties
              }
              onClick={() => setOpenId(entry.session.id)}
            >
              <span className={styles.blockTime}>
                {formatTimeRange(entry.session, bundle.event.timezone)}
              </span>
              <span className={styles.blockTitle}>{entry.session.title}</span>
              <span className={styles.blockMeta}>
                {[entry.session.track, entry.session.format].filter(Boolean).join(' · ')}
              </span>
            </button>
          ))}
        </div>
      </div>

      {layout.undated.length > 0 ? (
        <div className={styles.itineraryList} style={{ marginTop: 'var(--space-4)' }}>
          {layout.undated.map((session) => (
            <article key={session.id} className={styles.sessionCard}>
              <h3 className={styles.sessionTitle}>{session.title}</h3>
              <SessionChips session={session} options={options} />
              <SpeakerRoster session={session} />
              {options.showDescription ? (
                <ShowMore text={session.descriptionText} html={session.descriptionHtml} />
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
