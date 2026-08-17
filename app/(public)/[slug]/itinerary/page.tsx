import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { appUrl } from '@/lib/env';
import { createSocialMetadata } from '@/lib/site-metadata';
import { EmbedBody } from '../../../embed/EmbedBody';
import { loadPublicBundle, parseEmbedOptions } from '../../../embed/queries';
import { PublicChrome, publicStyles as styles } from '../PublicChrome';

export const dynamic = 'force-dynamic';

type Params = { slug: string };
type Search = Record<string, string | string[] | undefined>;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const bundle = await loadPublicBundle(slug);
  if (!bundle) return { title: 'Event not found' };
  return createSocialMetadata({
    origin: appUrl(),
    path: `/${bundle.event.slug}/itinerary`,
    title: `My schedule · ${bundle.event.name}`,
    description: bundle.event.tagline ?? `Build a personal schedule for ${bundle.event.name}.`,
  });
}

/** `G-4`, `EMB-09`–`EMB-11`: the itinerary and the personal schedule built out of it. */
export default async function PublicItineraryPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const [{ slug }, search] = await Promise.all([params, searchParams]);
  const bundle = await loadPublicBundle(slug);
  if (!bundle) notFound();

  return (
    <PublicChrome event={bundle.event} active="itinerary">
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>My schedule</h2>
          <span className={styles.sectionLink}>
            Star talks here or on the agenda, then export them to your calendar.
          </span>
        </div>
        <EmbedBody
          view="itinerary"
          bundle={bundle}
          options={parseEmbedOptions(search)}
          speakerBase={`/${bundle.event.slug}/speakers`}
          sessionBase={`/${bundle.event.slug}/sessions`}
        />
      </section>
    </PublicChrome>
  );
}
