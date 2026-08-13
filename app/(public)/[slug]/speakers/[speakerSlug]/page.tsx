import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { appUrl } from '@/lib/env';
import { createSocialMetadata } from '@/lib/site-metadata';
import { embedStyles } from '../../../../embed/EmbedBody';
import { loadPublicBundle, parseEmbedOptions, sessionsForSpeaker } from '../../../../embed/queries';
import { SpeakerProfile } from '../../../../embed/views/parts';
import { PublicChrome, publicStyles as styles } from '../../PublicChrome';

export const dynamic = 'force-dynamic';

type Params = { slug: string; speakerSlug: string };
type Search = Record<string, string | string[] | undefined>;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug, speakerSlug } = await params;
  const bundle = await loadPublicBundle(slug);
  const speaker = bundle?.speakers.find((entry) => entry.slug === speakerSlug);
  if (!bundle || !speaker) return { title: 'Speaker not found' };
  return createSocialMetadata({
    origin: appUrl(),
    path: `/${bundle.event.slug}/speakers/${speaker.slug}`,
    title: `${speaker.name} · ${bundle.event.name}`,
    description: speaker.bioExcerpt || `${speaker.name} is speaking at ${bundle.event.name}.`,
  });
}

/** `EMB-05`. The directory drill-in as a shareable page, with no login between it and a reader. */
export default async function PublicSpeakerPage({
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
    <PublicChrome event={bundle.event} active='speakers'>
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle} dir='auto'>
            {speaker.name}
          </h2>
          <Link href={`/${bundle.event.slug}/speakers`} className={styles.sectionLink}>
            ← All speakers
          </Link>
        </div>
        <div className={embedStyles.detail}>
          <SpeakerProfile
            speaker={speaker}
            sessions={sessionsForSpeaker(bundle.sessions, speaker)}
            timezone={bundle.event.timezone}
            showPhoto={options.showPhoto}
            showName={false}
            sessionBase={`/${bundle.event.slug}/sessions`}
          />
        </div>
      </section>
    </PublicChrome>
  );
}
