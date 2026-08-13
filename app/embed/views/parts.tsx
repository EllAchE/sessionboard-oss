'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import {
  facetValues,
  formatFullDateTime,
  initialsOf,
  speakerLine,
  type EmbedOptions,
  type PublicSession,
  type PublicSpeaker,
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

export type FacetState = { tracks: string[]; formats: string[]; rooms: string[] };

export const EMPTY_FACETS: FacetState = { tracks: [], formats: [], rooms: [] };

export function countFacets(facets: FacetState): number {
  return facets.tracks.length + facets.formats.length + facets.rooms.length;
}

export function facetsMatch(session: PublicSession, facets: FacetState): boolean {
  if (facets.tracks.length > 0 && !facets.tracks.includes(session.track ?? '')) return false;
  if (facets.formats.length > 0 && !facets.formats.includes(session.format ?? '')) return false;
  if (facets.rooms.length > 0 && !facets.rooms.includes(session.room ?? '')) return false;
  return true;
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
}

/** `EMB-03`. Track, Format and Location, each offering only the values the data actually holds. */
export function FacetPanel({
  sessions,
  facets,
  onChange,
}: {
  sessions: PublicSession[];
  facets: FacetState;
  onChange: (next: FacetState) => void;
}) {
  const groups = [
    { key: 'tracks' as const, title: 'Track', options: facetValues(sessions, (s) => s.track) },
    { key: 'formats' as const, title: 'Format', options: facetValues(sessions, (s) => s.format) },
    { key: 'rooms' as const, title: 'Location', options: facetValues(sessions, (s) => s.room) },
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
              <span>{option.value}</span>
              <span className={styles.facetCount}>{option.count}</span>
            </label>
          ))}
        </div>
      ))}
      {countFacets(facets) > 0 ? (
        <div className={styles.filterFooter}>
          <button
            type="button"
            className={styles.controlButton}
            onClick={() => onChange(EMPTY_FACETS)}
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
      {options.showRoom && session.room ? <span className={styles.chip}>{session.room}</span> : null}
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
export function SpeakerRoster({ session }: { session: PublicSession }) {
  if (session.speakers.length === 0) return null;
  return (
    <div className={styles.speakerRoster}>
      {session.speakers.map((person) => {
        const role = speakerLine(person);
        return (
          <span key={person.id}>
            <span className={styles.rosterName}>{person.name}</span>
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
  return <img className={styles.avatar} src={speaker.headshotUrl} alt="" loading="lazy" />;
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
}: {
  speaker: PublicSpeaker;
  sessions: PublicSession[];
  timezone: string;
  showPhoto?: boolean;
  showName?: boolean;
}) {
  const role = speakerLine(speaker);

  return (
    <>
      <div className={styles.detailHead}>
        {showPhoto ? (
          speaker.headshotUrl ? (
            <img className={styles.detailPhoto} src={speaker.headshotUrl} alt={speaker.name} />
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
          {!role ? <p className={styles.speakerRole}>Orator</p> : null}
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
        <span className={styles.detailSectionTitle}>Life of the orator</span>
        {speaker.bioText || speaker.bioHtml ? (
          <ShowMore text={speaker.bioText} html={speaker.bioHtml} limit={240} />
        ) : (
          <p className={styles.speakerRole}>The annals hold no public biography yet.</p>
        )}
      </div>

      <div className={styles.detailSection}>
        <span className={styles.detailSectionTitle}>
          Orations ({sessions.length})
        </span>
        {sessions.length === 0 ? (
          <p className={styles.speakerRole}>No oration has yet been proclaimed.</p>
        ) : (
          sessions.map((session) => (
            <div key={session.id} className={styles.detailSession}>
              <span className={styles.sessionTitle}>{session.title}</span>
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
