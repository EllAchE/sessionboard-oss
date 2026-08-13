'use client';

import { useMemo, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { sessionMatches, type EmbedOptions, type PublicBundle } from '../model';
import {
  EMPTY_FACETS,
  FacetPanel,
  SearchField,
  SessionChips,
  SessionFacts,
  ShowMore,
  SpeakerRoster,
  countFacets,
  facetsMatch,
  type FacetState,
} from './parts';
import styles from '../embed.module.css';

/** `EMB-01`–`EMB-03`. */
export function SessionsWidget({
  bundle,
  options,
  speakerBase,
}: {
  bundle: PublicBundle;
  options: EmbedOptions;
  speakerBase: string;
}) {
  const [query, setQuery] = useState(options.query);
  const [facets, setFacets] = useState<FacetState>(EMPTY_FACETS);
  const [filtersOpen, setFiltersOpen] = useState(true);

  const visible = useMemo(
    () =>
      bundle.sessions.filter(
        (session) =>
          sessionMatches(session, query) && facetsMatch(session, facets, bundle.event.timezone),
      ),
    [bundle.event.timezone, bundle.sessions, query, facets],
  );

  const activeFacets = countFacets(facets);

  return (
    <div>
      <div className={styles.toolbar}>
        <SearchField
          value={query}
          onChange={setQuery}
          label="Search talks, speakers, or topics"
          placeholder="Search talks, speakers, or topics…"
        />
        <button
          type="button"
          className={styles.controlButton}
          data-on={filtersOpen || activeFacets > 0}
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <SlidersHorizontal size={14} aria-hidden />
          Filters
          {activeFacets > 0 ? ` (${activeFacets})` : ''}
        </button>
        <span className={styles.resultCount} role="status">
          {visible.length} of {bundle.sessions.length} sessions
        </span>
      </div>

      {filtersOpen ? (
        <FacetPanel
          sessions={bundle.sessions}
          facets={facets}
          timezone={bundle.event.timezone}
          onChange={setFacets}
        />
      ) : null}

      {visible.length === 0 ? (
        <p className={styles.empty}>No sessions match that search.</p>
      ) : (
        <div className={styles.sessionList}>
          {visible.map((session) => (
            <article key={session.id} className={styles.sessionCard} id={`session-${session.ref}`}>
              <h3 className={styles.sessionTitle}>{session.title}</h3>
              <SessionFacts
                session={session}
                timezone={bundle.event.timezone}
                showRoom={options.showRoom}
              />
              <SessionChips session={session} options={options} />
              <SpeakerRoster session={session} speakerBase={speakerBase} />
              {options.showDescription ? (
                <ShowMore
                  text={session.descriptionText}
                  html={session.descriptionHtml}
                  limit={160}
                />
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
