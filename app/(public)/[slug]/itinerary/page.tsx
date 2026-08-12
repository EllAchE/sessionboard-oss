import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
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
  return { title: `Schedule · ${bundle.event.name}` };
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
          <h2 className={styles.sectionTitle}>Schedule</h2>
          <span className={styles.sectionLink}>
            Star the talks you want and export them to your calendar.
          </span>
        </div>
        <EmbedBody view="itinerary" bundle={bundle} options={parseEmbedOptions(search)} />
      </section>
    </PublicChrome>
  );
}
