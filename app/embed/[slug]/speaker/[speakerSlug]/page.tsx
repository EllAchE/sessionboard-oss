import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { embedStyles as styles } from '../../../EmbedBody';
import { loadPublicBundle, parseEmbedOptions, sessionsForSpeaker } from '../../../queries';
import { SpeakerProfile } from '../../../views/parts';

export const dynamic = 'force-dynamic';

type Params = { slug: string; speakerSlug: string };
type Search = Record<string, string | string[] | undefined>;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug, speakerSlug } = await params;
  const bundle = await loadPublicBundle(slug);
  const speaker = bundle?.speakers.find((entry) => entry.slug === speakerSlug);
  return { title: speaker ? `${speaker.name} · ${slug}` : 'Cicero', robots: { index: false } };
}

/** `EMB-05` as a permalink, so a speaker profile survives being shared out of the widget. */
export default async function EmbedSpeakerPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const [{ slug, speakerSlug }, search] = await Promise.all([params, searchParams]);
  const bundle = await loadPublicBundle(slug);
  if (!bundle) notFound();

  const speaker = bundle.speakers.find(
    (entry) => entry.slug === speakerSlug || entry.id === speakerSlug,
  );
  if (!speaker) notFound();

  const options = parseEmbedOptions(search);

  return (
    <div className={styles.root} data-theme={options.theme === 'auto' ? undefined : options.theme}>
      <div className={styles.backRow}>
        <a className={styles.controlButton} href={`/embed/${slug}/speakers`}>
          ← All orators
        </a>
      </div>
      <div className={styles.detail}>
        <SpeakerProfile
          speaker={speaker}
          sessions={sessionsForSpeaker(bundle.sessions, speaker)}
          timezone={bundle.event.timezone}
          showPhoto={options.showPhoto}
          sessionBase={`/embed/${bundle.event.slug}/sessions`}
        />
      </div>
    </div>
  );
}
