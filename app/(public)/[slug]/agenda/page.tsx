import Link from 'next/link';
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
  return { title: `Agenda · ${bundle.event.name}` };
}

/** `G-4`. Full-page agenda with a track filter, over the same read model as `/embed/[slug]/agenda`. */
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

  const options = parseEmbedOptions(search);
  const activeTrack = options.tracks[0] ?? null;

  return (
    <PublicChrome event={bundle.event} active="agenda">
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Agenda</h2>
          <span className={styles.sectionLink}>{bundle.sessions.length} published sessions</span>
        </div>

        {bundle.tracks.length > 0 ? (
          <div className={styles.filterBar}>
            <Link
              href={`/${bundle.event.slug}/agenda`}
              className={styles.filterChip}
              data-active={!activeTrack}
            >
              All tracks
            </Link>
            {bundle.tracks.map((track) => (
              <Link
                key={track.id}
                href={`/${bundle.event.slug}/agenda?track=${encodeURIComponent(track.name)}`}
                className={styles.filterChip}
                data-active={activeTrack?.toLowerCase() === track.name.toLowerCase()}
              >
                {track.name}
              </Link>
            ))}
          </div>
        ) : null}

        <EmbedBody view="agenda" bundle={bundle} options={options} />
      </section>
    </PublicChrome>
  );
}
