import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { appUrl } from '@/lib/env';
import { listPublicSponsors } from '@/lib/services/sponsors';
import { createSocialMetadata } from '@/lib/site-metadata';
import { getPublicEvent } from '../../../embed/queries';
import { PublicChrome, publicStyles as styles } from '../PublicChrome';
import { buildSponsorWall, type WallEntry } from './wall';

export const dynamic = 'force-dynamic';

type Params = { slug: string };

/**
 * `getPublicEvent` rather than `loadPublicBundle`: the wall renders no session and no speaker, and
 * the bundle is four joins this page would throw away.
 */
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const event = await getPublicEvent(slug);
  if (!event) return { title: 'Event not found' };
  return createSocialMetadata({
    origin: appUrl(),
    path: `/${event.slug}/sponsors`,
    title: `Sponsors · ${event.name}`,
    description: event.tagline ?? `The organisations behind ${event.name}.`,
  });
}

/**
 * `E-7`, `G-4`. The public sponsor wall.
 *
 * Both kinds live on one page rather than two. They differ by a single field — an exhibitor stands
 * somewhere on a floor and a sponsor does not — which is the same reason `db/schema.ts` gives them
 * one table, and an attendee looking for who is here does not want to be asked which sort of "here"
 * they meant. The nav tab is called Sponsors because that is what the page is read as; the exhibitor
 * heading carries its own name for the events that use both.
 *
 * An event with no sponsors 404s rather than showing an empty wall, which is the same answer the
 * chrome gives by not offering the tab. There is no third state where the page exists but says
 * nothing.
 */
export default async function PublicSponsorsPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const event = await getPublicEvent(slug);
  if (!event) notFound();

  const sections = buildSponsorWall(event.slug, await listPublicSponsors(event.id));
  if (sections.length === 0) notFound();

  return (
    <PublicChrome event={event} active="sponsors">
      {sections.map((section) => (
        <section key={section.kind} className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>{section.title}</h2>
            <span className={styles.sectionLink}>
              {section.count} {section.count === 1 ? section.singular : `${section.singular}s`}
            </span>
          </div>
          <p className={styles.sponsorLede}>{section.lede}</p>
          {section.tiers.map((tier) => (
            <div key={tier.key} className={styles.sponsorTier}>
              {tier.label ? <h3 className={styles.sponsorTierLabel}>{tier.label}</h3> : null}
              <ul className={styles.sponsorGrid}>
                {tier.entries.map((entry) => (
                  <li key={entry.id} className={styles.sponsorCard}>
                    <SponsorMark entry={entry} />
                    {entry.boothLocation ? (
                      <p className={styles.sponsorBooth}>Booth {entry.boothLocation}</p>
                    ) : null}
                    {entry.description ? (
                      <p className={styles.sponsorBlurb}>{entry.description}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </PublicChrome>
  );
}

/**
 * The logo and the name, as one link when there is a website to point at. The name is always
 * rendered rather than being replaced by the image: a logo is a picture of a word, several of them
 * are unreadable at wall size, and `alt` alone would leave a sighted reader guessing.
 */
function SponsorMark({ entry }: { entry: WallEntry }) {
  const mark = (
    <>
      {entry.logoUrl ? (
        <span className={styles.sponsorLogoFrame}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a route handler serves this, not the image optimiser */}
          <img src={entry.logoUrl} alt="" className={styles.sponsorLogo} />
        </span>
      ) : null}
      <span className={styles.sponsorName}>{entry.name}</span>
    </>
  );

  return entry.websiteUrl ? (
    <a href={entry.websiteUrl} className={styles.sponsorLink} rel="noreferrer" target="_blank">
      {mark}
    </a>
  ) : (
    <span className={styles.sponsorLink}>{mark}</span>
  );
}
