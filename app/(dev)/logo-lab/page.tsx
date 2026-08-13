import type { Metadata } from 'next';
import { LOGO_CONCEPTS } from './logo-concepts';
import styles from './logo-lab.module.css';

export const metadata: Metadata = {
  title: 'Logo explorations · Cicero',
  description: 'Early Cicero logo directions for review.',
};

const SIZES = [16, 24, 32] as const;

export default function LogoLabPage() {
  return (
    <main className={styles.page}>
      <header className={styles.intro}>
        <p className={styles.eyebrow}>Cicero identity study · round one</p>
        <h1>A mark for the public square.</h1>
        <p className={styles.lead}>
          Eight monochrome directions inspired by forums, civic architecture, assembly, and
          oratory. Every mark is shown at the sizes that matter before a direction is chosen.
        </p>
        <div className={styles.note}>
          Exploration only · no candidate is used by the product or favicon yet
        </div>
      </header>

      <section className={styles.grid} aria-label="Logo candidates">
        {LOGO_CONCEPTS.map(({ id, name, idea, Mark }) => (
          <article className={styles.card} key={id}>
            <div className={styles.cardHeading}>
              <span className={styles.number}>{id}</span>
              <div>
                <h2>{name}</h2>
                <p>{idea}</p>
              </div>
            </div>

            <div className={styles.heroMark}>
              <Mark aria-hidden="true" />
            </div>

            <div className={styles.lockup}>
              <span className={styles.lockupTile}>
                <Mark aria-hidden="true" />
              </span>
              <span>Cicero</span>
            </div>

            <div className={styles.sizeStudy} aria-label={`${name} size study`}>
              {SIZES.map((size) => (
                <div className={styles.sizeSample} key={size}>
                  <span className={styles.sizeCanvas}>
                    <Mark width={size} height={size} aria-hidden="true" />
                  </span>
                  <span>{size}px</span>
                </div>
              ))}
              <div className={styles.sizeSample}>
                <span className={`${styles.sizeCanvas} ${styles.accentCanvas}`}>
                  <Mark width={24} height={24} aria-hidden="true" />
                </span>
                <span>reverse</span>
              </div>
              <div className={styles.sizeSample}>
                <span className={`${styles.sizeCanvas} ${styles.darkCanvas}`}>
                  <Mark width={24} height={24} aria-hidden="true" />
                </span>
                <span>dark</span>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className={styles.decisionGuide}>
        <p className={styles.eyebrow}>How to choose</p>
        <h2>Start with the 16px row.</h2>
        <p>
          Pick the mark that remains distinctive there, then use the large rendering to judge
          character. Once one direction wins, it can be refined into the actual logo, favicon,
          app icon, and wordmark lockup.
        </p>
      </section>
    </main>
  );
}
