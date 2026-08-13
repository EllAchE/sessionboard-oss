'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Star } from 'lucide-react';
import { buildScheduleCalendar, calendarFilename } from '../calendar';
import {
  formatShortDay,
  groupByDay,
  type EmbedOptions,
  type PublicBundle,
  type PublicSession,
} from '../model';
import { SessionFacts, ShowMore, SpeakerRoster } from './parts';
import styles from '../embed.module.css';

const MINE = 'mine';

/**
 * `EMB-09`–`EMB-11`. The personal schedule is `localStorage`, not an account: an attendee reading an
 * embedded widget on somebody else's website has no reason to sign in, and a starred talk that
 * survives a reload is the whole of what the requirement asks for.
 */
function storageKey(slug: string): string {
  return `cicero-my-schedule:${slug}`;
}

export function ItineraryWidget({
  bundle,
  options,
  speakerBase,
}: {
  bundle: PublicBundle;
  options: EmbedOptions;
  speakerBase: string;
}) {
  const days = useMemo(
    () => groupByDay(bundle.sessions, bundle.event.timezone),
    [bundle.sessions, bundle.event.timezone],
  );

  const [tab, setTab] = useState<string>(options.day ?? days[0]?.date ?? MINE);
  const [starred, setStarred] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const key = storageKey(bundle.event.slug);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed))
        setStarred(parsed.filter((id): id is string => typeof id === 'string'));
    } catch {
      /* A corrupt or blocked store just means an empty schedule, never a broken widget. */
    }
    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(starred));
    } catch {
      /* Private-mode storage refuses writes; the selection still works for this page view. */
    }
  }, [hydrated, key, starred]);

  const chosen = useMemo(
    () => bundle.sessions.filter((session) => starred.includes(session.id)),
    [bundle.sessions, starred],
  );

  const toggleStar = (id: string) =>
    setStarred((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );

  const exportSelection = () => {
    const ics = buildScheduleCalendar(chosen, bundle.event);
    if (!ics) return;
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = calendarFilename(bundle.event);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const visible: PublicSession[] =
    tab === MINE ? chosen : (days.find((day) => day.date === tab)?.sessions ?? []);

  return (
    <div>
      <div className={styles.dayTabs} role="tablist" aria-label="Schedule days">
        {days.map((day) => (
          <button
            key={day.date}
            type="button"
            role="tab"
            className={styles.dayTab}
            aria-selected={tab === day.date}
            onClick={() => setTab(day.date)}
          >
            {day.date === 'tbd'
              ? 'To be announced'
              : formatShortDay(
                  day.sessions.find((session) => session.startsAt)?.startsAt ?? day.date,
                  bundle.event.timezone,
                )}
          </button>
        ))}
        <button
          type="button"
          role="tab"
          className={styles.dayTab}
          aria-selected={tab === MINE}
          onClick={() => setTab(MINE)}
        >
          ★ My schedule ({chosen.length})
        </button>
      </div>

      <div className={styles.exportBar}>
        <span>
          {chosen.length === 0
            ? 'Star a session to start building your personal schedule.'
            : `${chosen.length} session${chosen.length === 1 ? '' : 's'} in your schedule.`}
        </span>
        <button
          type="button"
          className={styles.controlButton}
          disabled={chosen.length === 0}
          onClick={exportSelection}
        >
          <CalendarPlus size={14} aria-hidden />
          Add to calendar (.ics)
        </button>
      </div>

      {visible.length === 0 ? (
        <p className={styles.empty}>
          {tab === MINE
            ? 'Your schedule is empty. Star a session on any day tab to add it.'
            : 'Nothing is scheduled for this day yet.'}
        </p>
      ) : (
        <div className={styles.itineraryList}>
          {visible.map((session) => {
            const isStarred = starred.includes(session.id);
            return (
              <article
                key={session.id}
                className={styles.itineraryCard}
                id={`itinerary-${session.ref}`}
              >
                <div className={styles.itineraryBody}>
                  {options.showTrack && session.track ? (
                    <span className={styles.trackLabel}>{session.track}</span>
                  ) : null}
                  <h3 className={styles.sessionTitle}>{session.title}</h3>
                  <SessionFacts
                    session={session}
                    timezone={bundle.event.timezone}
                    showRoom={options.showRoom}
                  />
                  {session.format || session.tags.length > 0 ? (
                    <div className={styles.metaRow}>
                      {session.format ? (
                        <span className={styles.chip}>{session.format}</span>
                      ) : null}
                      {session.tags.map((tag) => (
                        <span key={tag.id} className={styles.chip} data-kind="topic">
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {options.showDescription ? (
                    <ShowMore
                      text={session.descriptionText}
                      html={session.descriptionHtml}
                      limit={200}
                    />
                  ) : null}
                  <SpeakerRoster session={session} speakerBase={speakerBase} />
                </div>
                <button
                  type="button"
                  className={styles.starButton}
                  data-starred={isStarred}
                  aria-pressed={isStarred}
                  onClick={() => toggleStar(session.id)}
                >
                  <Star size={14} aria-hidden fill={isStarred ? 'currentColor' : 'none'} />
                  {isStarred ? 'In my schedule' : 'Add to my schedule'}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
