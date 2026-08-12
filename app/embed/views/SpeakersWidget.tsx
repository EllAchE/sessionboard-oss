'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import {
  sessionsForSpeaker,
  sortSpeakers,
  speakerMatches,
  type EmbedOptions,
  type PublicBundle,
} from '../model';
import { SearchField, SpeakerAvatar, SpeakerProfile } from './parts';
import styles from '../embed.module.css';

/** `EMB-04`, `EMB-05`. */
export function SpeakersWidget({
  bundle,
  options,
  speakerBase,
}: {
  bundle: PublicBundle;
  options: EmbedOptions;
  speakerBase: string;
}) {
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(
    bundle.speakers.length === 1 && options.speaker ? bundle.speakers[0].id : null,
  );

  const ordered = useMemo(() => sortSpeakers(bundle.speakers), [bundle.speakers]);
  const visible = useMemo(
    () => ordered.filter((speaker) => speakerMatches(speaker, query)),
    [ordered, query],
  );

  const open = openId ? ordered.find((speaker) => speaker.id === openId) : undefined;

  if (open) {
    return (
      <div>
        <div className={styles.backRow}>
          <button type="button" className={styles.controlButton} onClick={() => setOpenId(null)}>
            <ArrowLeft size={14} aria-hidden />
            Back to speakers
          </button>
          <a className={styles.speakerLink} href={`${speakerBase}/${open.slug}`}>
            Open this profile on its own page
          </a>
        </div>
        <div className={styles.detail} id={`speaker-${open.slug}`}>
          <SpeakerProfile
            speaker={open}
            sessions={sessionsForSpeaker(bundle.sessions, open)}
            timezone={bundle.event.timezone}
            showPhoto={options.showPhoto}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className={styles.toolbar}>
        <SearchField
          value={query}
          onChange={setQuery}
          label="Search speakers by name"
          placeholder="Search speakers by name…"
        />
        <span className={styles.resultCount} role="status">
          {visible.length} of {ordered.length} speakers
        </span>
      </div>

      {visible.length === 0 ? (
        <p className={styles.empty}>
          {ordered.length === 0
            ? 'No speakers have been announced yet.'
            : 'No speaker matches that search.'}
        </p>
      ) : (
        <div className={styles.directory}>
          {visible.map((speaker) => (
            <button
              key={speaker.id}
              type="button"
              className={styles.directoryRow}
              id={`speaker-${speaker.slug}`}
              onClick={() => setOpenId(speaker.id)}
            >
              <SpeakerAvatar speaker={speaker} show={options.showPhoto} />
              <span className={styles.directoryBody}>
                <span className={styles.directoryName}>{speaker.name}</span>
                {speaker.jobTitle ? (
                  <span className={styles.speakerRole}>{speaker.jobTitle}</span>
                ) : null}
                {speaker.company ? (
                  <span className={styles.speakerRole}>{speaker.company}</span>
                ) : null}
              </span>
              <span className={styles.directoryMeta}>
                {speaker.sessionIds.length} session{speaker.sessionIds.length === 1 ? '' : 's'}
              </span>
              <ChevronRight size={16} aria-hidden />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
