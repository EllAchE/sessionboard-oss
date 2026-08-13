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
  return { title: `Fasti · ${bundle.event.name}` };
}

/** `G-4`. The room-by-time grid, over the same read model as `/embed/[slug]/agenda`. */
export default async function PublicAgendaPage({
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
    <PublicChrome event={bundle.event} active="agenda">
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Fasti</h2>
          <span className={styles.sectionLink}>{bundle.sessions.length} proclaimed orations</span>
        </div>
        <EmbedBody view="agenda" bundle={bundle} options={parseEmbedOptions(search)} />
      </section>
    </PublicChrome>
  );
}
