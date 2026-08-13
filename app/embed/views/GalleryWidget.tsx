'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { Dialog } from '@/components/ui';
import {
  initialsOf,
  sessionsForSpeaker,
  sortSpeakers,
  speakerMatches,
  type EmbedOptions,
  type PublicBundle,
} from '../model';
import { SearchField, SpeakerProfile } from './parts';
import styles from '../embed.module.css';

/**
 * `EMB-12`, `EMB-13`. A card degrades rather than collapses: a speaker with no headshot gets the
 * initials tile, and one with no job title simply loses that line instead of rendering an empty one.
 */
export function GalleryWidget({
  bundle,
  options,
  sessionBase,
}: {
  bundle: PublicBundle;
  options: EmbedOptions;
  sessionBase: string;
}) {
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const ordered = useMemo(() => sortSpeakers(bundle.speakers), [bundle.speakers]);
  const visible = useMemo(
    () => ordered.filter((speaker) => speakerMatches(speaker, query, bundle.sessions)),
    [bundle.sessions, ordered, query],
  );

  const open = openId ? ordered.find((speaker) => speaker.id === openId) : undefined;

  return (
    <div>
      <div className={styles.toolbar}>
        <SearchField
          value={query}
          onChange={setQuery}
          label="Search orators, houses, or orations"
          placeholder="Search orators, houses, or orations…"
        />
        <span className={styles.resultCount} role="status">
          {visible.length} of {ordered.length} orators
        </span>
      </div>

      {visible.length === 0 ? (
        <p className={styles.empty}>
          {ordered.length === 0
            ? 'No orator portrait has been unveiled yet.'
            : 'No orator answers that search.'}
        </p>
      ) : (
        <div className={styles.gallery}>
          {visible.map((speaker) => (
            <button
              key={speaker.id}
              type="button"
              className={styles.galleryCard}
              id={`speaker-${speaker.slug}`}
              onClick={() => setOpenId(speaker.id)}
            >
              {options.showPhoto ? (
                speaker.headshotUrl ? (
                  <Image
                    className={styles.headshot}
                    src={speaker.headshotUrl}
                    alt=""
                    width={640}
                    height={640}
                    unoptimized
                  />
                ) : (
                  <span className={styles.headshotFallback} aria-hidden>
                    {initialsOf(speaker.name)}
                  </span>
                )
              ) : null}
              <span className={styles.speakerName}>{speaker.name}</span>
              {speaker.jobTitle ? (
                <span className={styles.speakerRole}>{speaker.jobTitle}</span>
              ) : null}
              {speaker.company ? (
                <span className={styles.speakerRole}>{speaker.company}</span>
              ) : null}
            </button>
          ))}
        </div>
      )}

      <Dialog
        open={Boolean(open)}
        onOpenChange={(next) => {
          if (!next) setOpenId(null);
        }}
        title={open?.name ?? ''}
        size="lg"
      >
        {open ? (
          <div className={styles.modalBody}>
            <SpeakerProfile
              speaker={open}
              sessions={sessionsForSpeaker(bundle.sessions, open)}
              timezone={bundle.event.timezone}
              showPhoto={options.showPhoto}
              showName={false}
              sessionBase={sessionBase}
            />
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
