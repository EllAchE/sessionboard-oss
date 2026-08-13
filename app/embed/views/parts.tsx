'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Search } from 'lucide-react';
import {
  EMPTY_SESSION_FACETS,
  countSessionFacets,
  dayKeyOf,
  facetValues,
  formatFullDateTime,
  formatShortDay,
  initialsOf,
  sessionMatchesFacets,
  speakerLine,
  type EmbedOptions,
  type PublicSession,
  type PublicSpeaker,
  type SessionFacets,
} from '../model';
import styles from '../embed.module.css';

/**
 * The pieces every widget shares. They take plain data and never reach for the read model, so a
 * widget can be a client component without `pg` following it into the browser bundle.
 */

export function ShowMore({
  text,
  html,
  limit = 180,
  moreLabel = 'Show more',
  lessLabel = 'Show less',
}: {
  text: string;
  html: string;
  limit?: number;
  moreLabel?: string;
  lessLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!text && !html) return null;

  const needsToggle = text.length > limit;
  if (!needsToggle) {
    return <div className={styles.prose} dangerouslySetInnerHTML={{ __html: html }} />;
  }

  return (
    <>
      {expanded ? (
        <div className={styles.prose} dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p className={styles.truncated}>{`${text.slice(0, limit).trimEnd()}…`}</p>
      )}
      <button type="button" className={styles.showMore} onClick={() => setExpanded(!expanded)}>
        {expanded ? lessLabel : moreLabel}
      </button>
    </>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <span className={styles.searchField}>
      <Search size={14} aria-hidden />
      <input
        type="search"
        className={styles.searchInput}
        value={value}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
      />
    </span>
  );
}

export {
  EMPTY_SESSION_FACETS as EMPTY_FACETS,
  countSessionFacets as countFacets,
  sessionMatchesFacets as facetsMatch,
};
export type FacetState = SessionFacets;

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
}

/** `EMB-03`. Every facet offers only values held by the published sessions. */
export function FacetPanel({
  sessions,
  facets,
  timezone,
  onChange,
}: {
  sessions: PublicSession[];
  facets: FacetState;
  timezone: string;
  onChange: (next: FacetState) => void;
}) {
  const days = facetValues(sessions, (session) =>
    session.startsAt ? dayKeyOf(session.startsAt, timezone) : 'tbd',
  ).map((option) => {
    const sample = sessions.find(
      (session) =>
        (session.startsAt ? dayKeyOf(session.startsAt, timezone) : 'tbd') === option.value,
    );
    return {
      ...option,
      label:
        option.value === 'tbd' || !sample?.startsAt
          ? 'To be announced'
          : formatShortDay(sample.startsAt, timezone),
    };
  });
  const groups = [
    { key: 'days' as const, title: 'Day', options: days },
    {
      key: 'topics' as const,
      title: 'Topic',
      options: facetValues(sessions, (session) => session.tags.map((tag) => tag.name)).map(
        (option) => ({ ...option, label: option.value }),
      ),
    },
    {
      key: 'tracks' as const,
      title: 'Track',
      options: facetValues(sessions, (session) => session.track).map((option) => ({
        ...option,
        label: option.value,
      })),
    },
    {
      key: 'formats' as const,
      title: 'Format',
      options: facetValues(sessions, (session) => session.format).map((option) => ({
        ...option,
        label: option.value,
      })),
    },
    {
      key: 'rooms' as const,
      title: 'Location',
      options: facetValues(sessions, (session) => session.room).map((option) => ({
        ...option,
        label: option.value,
      })),
    },
  ].filter((group) => group.options.length > 0);

  if (groups.length === 0) return null;

  return (
    <div className={styles.filterPanel} role="group" aria-label="Filters">
      {groups.map((group) => (
        <div key={group.key} className={styles.facetGroup}>
          <span className={styles.facetTitle}>{group.title}</span>
          {group.options.map((option) => (
            <label key={option.value} className={styles.facetOption}>
              <input
                type="checkbox"
                checked={facets[group.key].includes(option.value)}
                onChange={() =>
                  onChange({ ...facets, [group.key]: toggle(facets[group.key], option.value) })
                }
              />
              <span>{option.label}</span>
              <span className={styles.facetCount}>{option.count}</span>
            </label>
          ))}
        </div>
      ))}
      {countSessionFacets(facets) > 0 ? (
        <div className={styles.filterFooter}>
          <button
            type="button"
            className={styles.controlButton}
            onClick={() => onChange(EMPTY_SESSION_FACETS)}
          >
            Clear filters
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function SessionChips({
  session,
  options,
}: {
  session: PublicSession;
  options: EmbedOptions;
}) {
  return (
    <div className={styles.metaRow}>
      {options.showTrack && session.track ? (
        <span className={styles.chip} data-kind="track">
          {session.track}
        </span>
      ) : null}
      {session.format ? <span className={styles.chip}>{session.format}</span> : null}
      {session.tags.map((tag) => (
        <span key={tag.id} className={styles.chip} data-kind="topic">
          {tag.name}
        </span>
      ))}
      {options.showRoom && session.room ? (
        <span className={styles.chip}>{session.room}</span>
      ) : null}
      {session.ceuCredits ? <span className={styles.chip}>{session.ceuCredits} CEU</span> : null}
    </div>
  );
}

export function SessionFacts({
  session,
  timezone,
  showRoom = true,
}: {
  session: PublicSession;
  timezone: string;
  showRoom?: boolean;
}) {
  return (
    <div className={styles.factRow}>
      <span className={styles.fact}>{formatFullDateTime(session, timezone)}</span>
      {showRoom && session.room ? <span className={styles.fact}>{session.room}</span> : null}
    </div>
  );
}

/** `EMB-01`, `EMB-09`: every speaker, each with the job title and company beside the name. */
export function SpeakerRoster({
  session,
  speakerBase,
}: {
  session: PublicSession;
  speakerBase: string;
}) {
  if (session.speakers.length === 0) return null;
  return (
    <div className={styles.speakerRoster}>
      {session.speakers.map((person) => {
        const role = speakerLine(person);
        return (
          <span key={person.id}>
            <a className={styles.rosterName} href={`${speakerBase}/${person.slug}`}>
              {person.name}
            </a>
            {role ? ` — ${role}` : null}
          </span>
        );
      })}
    </div>
  );
}

export function SpeakerAvatar({
  speaker,
  show = true,
}: {
  speaker: Pick<PublicSpeaker, 'name' | 'headshotUrl'>;
  show?: boolean;
}) {
  if (!show) return null;
  if (!speaker.headshotUrl) {
    return (
      <span className={styles.avatarFallback} aria-hidden>
        {initialsOf(speaker.name)}
      </span>
    );
  }
  return (
    <Image
      className={styles.avatar}
      src={speaker.headshotUrl}
      alt=""
      width={48}
      height={48}
      unoptimized
    />
  );
}

/**
 * `EMB-05`, `EMB-13`. The same profile body serves the directory drill-in, the gallery modal and
 * the standalone speaker page, so the three cannot disagree about what a speaker's page contains.
 */
export function SpeakerProfile({
  speaker,
  sessions,
  timezone,
  showPhoto = true,
  showName = true,
  sessionBase,
}: {
  speaker: PublicSpeaker;
  sessions: PublicSession[];
  timezone: string;
  showPhoto?: boolean;
  showName?: boolean;
  sessionBase: string;
}) {
  const role = speakerLine(speaker);

  return (
    <>
      <div className={styles.detailHead}>
        {showPhoto ? (
          speaker.headshotUrl ? (
            <Image
              className={styles.detailPhoto}
              src={speaker.headshotUrl}
              alt={speaker.name}
              width={128}
              height={128}
              unoptimized
            />
          ) : (
            <span className={styles.detailPhotoFallback} aria-hidden>
              {initialsOf(speaker.name)}
            </span>
          )
        ) : null}
        <div className={styles.detailIdentity}>
          {showName ? <h2 className={styles.detailName}>{speaker.name}</h2> : null}
          {speaker.pronouns ? <p className={styles.speakerRole}>{speaker.pronouns}</p> : null}
          {speaker.jobTitle ? <p className={styles.speakerRole}>{speaker.jobTitle}</p> : null}
          {speaker.company ? <p className={styles.speakerRole}>{speaker.company}</p> : null}
          {!role ? <p className={styles.speakerRole}>Speaker</p> : null}
          {speaker.links.length > 0 ? (
            <p className={styles.speakerLinks}>
              {speaker.links.map((link) => (
                <a
                  key={link.url}
                  className={styles.speakerLink}
                  href={link.url}
                  rel="nofollow ugc noopener"
                  target="_blank"
                >
                  {link.label || link.url}
                </a>
              ))}
            </p>
          ) : null}
        </div>
      </div>

      <div className={styles.detailSection}>
        <span className={styles.detailSectionTitle}>Biography</span>
        {speaker.bioText || speaker.bioHtml ? (
          <ShowMore text={speaker.bioText} html={speaker.bioHtml} limit={240} />
        ) : (
          <p className={styles.speakerRole}>No biography has been published yet.</p>
        )}
      </div>

      <div className={styles.detailSection}>
        <span className={styles.detailSectionTitle}>Sessions ({sessions.length})</span>
        {sessions.length === 0 ? (
          <p className={styles.speakerRole}>No published sessions yet.</p>
        ) : (
          sessions.map((session) => (
            <div key={session.id} className={styles.detailSession}>
              <a
                className={`${styles.sessionTitle} ${styles.sessionRelationLink}`}
                href={`${sessionBase}#session-${session.ref}`}
              >
                {session.title}
              </a>
              <span className={styles.factRow}>
                <span className={styles.fact}>{formatFullDateTime(session, timezone)}</span>
                {session.room ? <span className={styles.fact}>{session.room}</span> : null}
              </span>
              <span className={styles.speakerRole}>
                {[session.track, session.format].filter(Boolean).join(' · ')}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
