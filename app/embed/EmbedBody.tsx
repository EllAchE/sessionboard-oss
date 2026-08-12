import type { CSSProperties } from 'react';
import {
  applyFilters,
  formatTimeRange,
  groupByDay,
  type EmbedOptions,
  type PublicBundle,
  type PublicSession,
  type PublicSpeaker,
} from './queries';
import styles from './embed.module.css';

/**
 * The three embed surfaces, rendered on the server. They share a filter pass and a style shell so
 * `G-7`'s options behave identically wherever they are applied, and every one of them renders live
 * rows on each request — which is all `G-3` (auto-update, no re-paste) actually requires.
 */

export type EmbedView = 'agenda' | 'speakers' | 'sessions';

function shellStyle(options: EmbedOptions): CSSProperties {
  const style: Record<string, string> = { '--embed-columns': String(options.columns) };
  if (options.accent) {
    style['--accent'] = options.accent;
    style['--border-accent'] = options.accent;
    style['--text-accent'] = options.accent;
  }
  return style as CSSProperties;
}

function Chips({ session, options }: { session: PublicSession; options: EmbedOptions }) {
  return (
    <div className={styles.metaRow}>
      {options.showTrack && session.track ? (
        <span className={styles.chip} data-kind="track">
          {session.track}
        </span>
      ) : null}
      {options.showRoom && session.room ? <span className={styles.chip}>{session.room}</span> : null}
      {session.format ? <span className={styles.chip}>{session.format}</span> : null}
      {session.ceuCredits ? (
        <span className={styles.chip}>{session.ceuCredits} CEU</span>
      ) : null}
    </div>
  );
}

function SpeakerLine({ session }: { session: PublicSession }) {
  if (session.speakers.length === 0) return null;
  return (
    <p className={styles.speakerLine}>
      {session.speakers
        .map((speaker) =>
          [speaker.name, [speaker.jobTitle, speaker.company].filter(Boolean).join(', ')]
            .filter(Boolean)
            .join(' — '),
        )
        .join(' · ')}
    </p>
  );
}

function AgendaView({
  bundle,
  options,
}: {
  bundle: PublicBundle;
  options: EmbedOptions;
}) {
  const days = groupByDay(bundle.sessions, bundle.event.timezone);
  if (days.length === 0) {
    return <p className={styles.empty}>The schedule has not been published yet.</p>;
  }

  return (
    <>
      {days.map((day) => (
        <section key={day.date} className={styles.day}>
          <h2 className={styles.dayLabel}>{day.label}</h2>
          {day.sessions.map((session) => (
            <article key={session.id} className={styles.slot} id={`session-${session.ref}`}>
              <span className={styles.slotTime}>
                {formatTimeRange(session, bundle.event.timezone)}
              </span>
              <div className={styles.slotBody}>
                <h3 className={styles.sessionTitle}>{session.title}</h3>
                <Chips session={session} options={options} />
                <SpeakerLine session={session} />
                {options.showDescription && session.descriptionHtml ? (
                  <div
                    className={styles.prose}
                    dangerouslySetInnerHTML={{ __html: session.descriptionHtml }}
                  />
                ) : null}
              </div>
            </article>
          ))}
        </section>
      ))}
    </>
  );
}

function SpeakerCard({
  speaker,
  options,
  sessions,
  highlighted,
}: {
  speaker: PublicSpeaker;
  options: EmbedOptions;
  sessions: PublicSession[];
  highlighted: boolean;
}) {
  const theirs = sessions.filter((session) => speaker.sessionIds.includes(session.id));
  const initials = speaker.name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase();

  return (
    <article
      className={styles.speakerCard}
      id={`speaker-${speaker.slug}`}
      data-speaker-id={speaker.id}
      data-highlighted={highlighted}
    >
      {options.showPhoto ? (
        speaker.headshotUrl ? (
          <img className={styles.headshot} src={speaker.headshotUrl} alt="" loading="lazy" />
        ) : (
          <span className={styles.headshotFallback} aria-hidden>
            {initials}
          </span>
        )
      ) : null}
      <h3 className={styles.speakerName}>
        {speaker.name}
        {speaker.pronouns ? <span className={styles.speakerRole}> ({speaker.pronouns})</span> : null}
      </h3>
      {speaker.jobTitle || speaker.company ? (
        <p className={styles.speakerRole}>
          {[speaker.jobTitle, speaker.company].filter(Boolean).join(', ')}
        </p>
      ) : null}
      {options.showBio && speaker.bioHtml ? (
        <div className={styles.prose} dangerouslySetInnerHTML={{ __html: speaker.bioHtml }} />
      ) : null}
      {theirs.length > 0 ? (
        <div className={styles.sessionLinks}>
          {theirs.map((session) => (
            <span key={session.id}>{session.title}</span>
          ))}
        </div>
      ) : null}
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
    </article>
  );
}

function SpeakersView({ bundle, options }: { bundle: PublicBundle; options: EmbedOptions }) {
  if (bundle.speakers.length === 0) {
    return <p className={styles.empty}>No speakers have been announced yet.</p>;
  }
  return (
    <div className={styles.gallery}>
      {bundle.speakers.map((speaker) => (
        <SpeakerCard
          key={speaker.id}
          speaker={speaker}
          options={options}
          sessions={bundle.sessions}
          highlighted={Boolean(options.speaker) && bundle.speakers.length === 1}
        />
      ))}
    </div>
  );
}

function SessionsView({ bundle, options }: { bundle: PublicBundle; options: EmbedOptions }) {
  if (bundle.sessions.length === 0) {
    return <p className={styles.empty}>No sessions have been published yet.</p>;
  }
  return (
    <div className={styles.sessionList}>
      {bundle.sessions.map((session) => (
        <article key={session.id} className={styles.sessionCard} id={`session-${session.ref}`}>
          <h3 className={styles.sessionTitle}>{session.title}</h3>
          <span className={styles.slotTime}>{formatTimeRange(session, bundle.event.timezone)}</span>
          <Chips session={session} options={options} />
          <SpeakerLine session={session} />
          {options.showDescription && session.descriptionHtml ? (
            <div
              className={styles.prose}
              dangerouslySetInnerHTML={{ __html: session.descriptionHtml }}
            />
          ) : null}
        </article>
      ))}
    </div>
  );
}

export function EmbedBody({
  view,
  bundle,
  options,
  showHeader = false,
}: {
  view: EmbedView;
  bundle: PublicBundle;
  options: EmbedOptions;
  showHeader?: boolean;
}) {
  const filtered = applyFilters(bundle, options);

  return (
    <div
      className={styles.root}
      style={shellStyle(options)}
      data-theme={options.theme === 'auto' ? undefined : options.theme}
    >
      {showHeader ? (
        <header className={styles.head}>
          <span className={styles.eventName}>{filtered.event.name}</span>
          {filtered.event.tagline ? (
            <span className={styles.tagline}>{filtered.event.tagline}</span>
          ) : null}
        </header>
      ) : null}
      {view === 'agenda' ? <AgendaView bundle={filtered} options={options} /> : null}
      {view === 'speakers' ? <SpeakersView bundle={filtered} options={options} /> : null}
      {view === 'sessions' ? <SessionsView bundle={filtered} options={options} /> : null}
    </div>
  );
}

export { styles as embedStyles };
