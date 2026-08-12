import type { CSSProperties } from 'react';
import { applyFilters, type EmbedOptions, type EmbedView, type PublicBundle } from './queries';
import { AgendaWidget } from './views/AgendaWidget';
import { GalleryWidget } from './views/GalleryWidget';
import { ItineraryWidget } from './views/ItineraryWidget';
import { SessionsWidget } from './views/SessionsWidget';
import { SpeakersWidget } from './views/SpeakersWidget';
import styles from './embed.module.css';

/**
 * The five embed surfaces. They share one filter pass and one style shell so `G-7`'s options behave
 * identically wherever they are applied, and every one of them renders live rows on each request —
 * which is all `G-3` (auto-update, no re-paste) actually requires.
 *
 * The shell is a Server Component and the widgets inside it are client ones: the data arrives fully
 * resolved as props, so search, facets and stars never cost a round trip and the read model never
 * reaches the browser bundle.
 */

export type { EmbedView };

function shellStyle(options: EmbedOptions): CSSProperties {
  const style: Record<string, string> = { '--embed-columns': String(options.columns) };
  if (options.accent) {
    style['--accent'] = options.accent;
    style['--border-accent'] = options.accent;
    style['--text-accent'] = options.accent;
  }
  return style as CSSProperties;
}

export function EmbedBody({
  view,
  bundle,
  options,
  showHeader = false,
  speakerBase,
}: {
  view: EmbedView;
  bundle: PublicBundle;
  options: EmbedOptions;
  showHeader?: boolean;
  /** Where a speaker permalink points, which differs between the iframe and the public site. */
  speakerBase?: string;
}) {
  const filtered = applyFilters(bundle, options);
  const speakerHref = speakerBase ?? `/embed/${bundle.event.slug}/speaker`;

  return (
    <div
      className={styles.root}
      style={shellStyle(options)}
      data-theme={options.theme === 'auto' ? undefined : options.theme}
      data-embed-view={view}
    >
      {showHeader ? (
        <header className={styles.head}>
          <span className={styles.eventName}>{filtered.event.name}</span>
          {filtered.event.tagline ? (
            <span className={styles.tagline}>{filtered.event.tagline}</span>
          ) : null}
        </header>
      ) : null}
      {view === 'agenda' ? <AgendaWidget bundle={filtered} options={options} /> : null}
      {view === 'itinerary' ? <ItineraryWidget bundle={filtered} options={options} /> : null}
      {view === 'sessions' ? <SessionsWidget bundle={filtered} options={options} /> : null}
      {view === 'speakers' ? (
        <SpeakersWidget bundle={filtered} options={options} speakerBase={speakerHref} />
      ) : null}
      {view === 'gallery' ? <GalleryWidget bundle={filtered} options={options} /> : null}
    </div>
  );
}

export { styles as embedStyles };
