import type { EmbedOptions, PublicSponsor } from '../model';
import styles from '../embed.module.css';

const COPY = {
  sponsor: { title: 'Sponsors', untiered: 'Also supporting' },
  exhibitor: { title: 'Exhibitors', untiered: 'Also exhibiting' },
} as const;

function groups(rows: PublicSponsor[]) {
  return (['sponsor', 'exhibitor'] as const).flatMap((kind) => {
    const owned = rows.filter((row) => row.kind === kind);
    if (owned.length === 0) return [];
    const hasTiers = owned.some((row) => row.tier);
    const tiers = new Map<string, PublicSponsor[]>();
    for (const row of owned) {
      const key = row.tier ?? '';
      tiers.set(key, [...(tiers.get(key) ?? []), row]);
    }
    return [{ kind, hasTiers, tiers: [...tiers.entries()] }];
  });
}

/** A published-only sponsor wall suitable for the same iframe loader as every other embed. */
export function SponsorsWidget({
  sponsors,
  options,
}: {
  sponsors: PublicSponsor[];
  options: EmbedOptions;
}) {
  const sections = groups(sponsors);
  if (sections.length === 0) return <p className={styles.empty}>No sponsors are published yet.</p>;

  return (
    <div className={styles.sponsorSections}>
      {sections.map((section) => (
        <section key={section.kind} className={styles.sponsorSection}>
          <h2 className={styles.sponsorHeading}>{COPY[section.kind].title}</h2>
          {section.tiers.map(([tier, entries]) => (
            <div key={tier} className={styles.sponsorTier}>
              {tier || section.hasTiers ? (
                <h3 className={styles.sponsorTierHeading}>
                  {tier || COPY[section.kind].untiered}
                </h3>
              ) : null}
              <ul className={styles.sponsorGrid}>
                {entries.map((entry) => (
                  <li key={entry.id} className={styles.sponsorCard}>
                    <SponsorMark entry={entry} />
                    {entry.boothLocation ? (
                      <span className={styles.sponsorBooth}>Booth {entry.boothLocation}</span>
                    ) : null}
                    {options.showDescription && entry.description ? (
                      <p className={styles.sponsorDescription}>{entry.description}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function SponsorMark({ entry }: { entry: PublicSponsor }) {
  const contents = (
    <>
      {entry.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a scoped route serves this logo
        <img className={styles.sponsorLogo} src={entry.logoUrl} alt="" />
      ) : (
        <span className={styles.sponsorLogoFallback} aria-hidden>
          {entry.name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className={styles.sponsorName}>{entry.name}</span>
    </>
  );

  return entry.websiteUrl ? (
    <a className={styles.sponsorMark} href={entry.websiteUrl} rel="noreferrer" target="_blank">
      {contents}
    </a>
  ) : (
    <span className={styles.sponsorMark}>{contents}</span>
  );
}
