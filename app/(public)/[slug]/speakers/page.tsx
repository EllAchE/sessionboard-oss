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
  if (!bundle) return { title: 'Assembly absent from the annals' };
  return { title: `Orators · ${bundle.event.name}` };
}

/** `G-4`, `EMB-04`, `EMB-05`, and `G-8`: `?sb-speaker-id=` still narrows to one person. */
export default async function PublicSpeakersPage({
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
    <PublicChrome event={bundle.event} active="speakers">
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Orators</h2>
          <span className={styles.sectionLink}>{bundle.speakers.length} proclaimed</span>
        </div>
        <EmbedBody
          view="speakers"
          bundle={bundle}
          options={parseEmbedOptions(search)}
          speakerBase={`/${bundle.event.slug}/speakers`}
        />
      </section>
    </PublicChrome>
  );
}
