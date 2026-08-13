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
  return { title: `Sessions · ${bundle.event.name}` };
}

/** `G-4`, `EMB-01`–`EMB-03`. The session list, which is the agenda with the clock taken off. */
export default async function PublicSessionsPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const [{ slug }, search] = await Promise.all([params, searchParams]);
  const bundle = await loadPublicBundle(slug);
  if (!bundle) notFound();

  const options = parseEmbedOptions(search);

  return (
    <PublicChrome event={bundle.event} active="sessions">
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Sessions</h2>
          <span className={styles.sectionLink}>{bundle.sessions.length} published</span>
        </div>
        <EmbedBody
          view="sessions"
          bundle={bundle}
          options={{ ...options, columns: 2 }}
          speakerBase={`/${bundle.event.slug}/speakers`}
          sessionBase={`/${bundle.event.slug}/sessions`}
        />
      </section>
    </PublicChrome>
  );
}
