import type { CSSProperties } from 'react';
import type { EmbedOptions } from '../model';
import styles from '../embed.module.css';

function mapStyle(options: EmbedOptions): CSSProperties {
  if (!options.accent) return {};
  return {
    '--accent': options.accent,
    '--border-accent': options.accent,
    '--text-accent': options.accent,
  } as CSSProperties;
}

/** `AR-36`. A browser-native PDF surface, deliberately without Cicero-authored map interactions. */
export function ExhibitorMapWidget({
  eventName,
  file,
  options,
}: {
  eventName: string;
  file: { filename: string; url: string } | null;
  options: EmbedOptions;
}) {
  return (
    <div
      className={styles.root}
      style={mapStyle(options)}
      data-theme={options.theme === 'auto' ? undefined : options.theme}
      data-embed-view="exhibitor-map"
    >
      {!file ? (
        <p className={styles.empty}>No exhibitor map is published yet.</p>
      ) : (
        <section className={styles.mapSection} aria-label={`${eventName} exhibitor map`}>
          <header className={styles.mapHeader}>
            <div>
              <h1 className={styles.mapTitle}>Exhibitor map</h1>
              <p className={styles.mapFilename}>{file.filename}</p>
            </div>
            <div className={styles.mapLinks}>
              <a href={file.url} target="_blank" rel="noreferrer">
                Open PDF
              </a>
              <a href={`${file.url}?download=1`}>Download PDF</a>
            </div>
          </header>
          <object
            className={styles.mapDocument}
            data={file.url}
            type="application/pdf"
            aria-label={`${eventName} exhibitor map PDF`}
          >
            <p className={styles.mapFallback}>
              This browser cannot display the PDF inline. <a href={file.url}>Open the map</a>.
            </p>
          </object>
        </section>
      )}
    </div>
  );
}
