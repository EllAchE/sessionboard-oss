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
  return { title: `Speaker gallery · ${bundle.event.name}` };
}

/** `G-4`, `EMB-12`, `EMB-13`. */
export default async function PublicGalleryPage({
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
    <PublicChrome event={bundle.event} active="gallery">
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Speaker gallery</h2>
          <span className={styles.sectionLink}>{bundle.speakers.length} announced</span>
        </div>
        <EmbedBody view="gallery" bundle={bundle} options={parseEmbedOptions(search)} />
      </section>
    </PublicChrome>
  );
}
