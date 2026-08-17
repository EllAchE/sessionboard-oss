import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { embedStyles as styles } from '@/app/embed/EmbedBody';
import { parseEmbedOptions, sessionsForSpeaker } from '@/app/embed/model';
import { SpeakerProfile } from '@/app/embed/views/parts';
import { shareContext } from '../../context';
import { ShareFrame } from '../../ShareFrame';

export const dynamic = 'force-dynamic';

type Params = { token: string; speakerSlug: string };
type Search = Record<string, string | string[] | undefined>;

export async function generateMetadata(): Promise<Metadata> {
  // No name in the title: a share URL in a browser history entry should not also name the person.
  return { title: 'Speaker · Shared preview', robots: { index: false, follow: false } };
}

/**
 * The speaker permalink the `speakers` and `gallery` widgets link to, kept inside the share link so
 * a click does not fall through to the public programme and 404 on a speaker who is still a draft.
 *
 * The speaker must already be in this link's bundle. That is the access check: `shareContext` built
 * the bundle from the token's own `eventId`, so a `speakerSlug` from a different event is simply not
 * in the array and 404s, with no cross-event query to get wrong.
 */
export default async function SharedSpeakerPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const [{ token, speakerSlug }, search] = await Promise.all([params, searchParams]);
  const context = await shareContext(token);
  if (!context) notFound();

  const { grant, bundle } = context;
  const speaker = bundle.speakers.find(
    (entry) => entry.slug === speakerSlug || entry.id === speakerSlug,
  );
  if (!speaker) notFound();

  const options = parseEmbedOptions(search);

  return (
    <ShareFrame grant={grant} eventName={bundle.event.name}>
      <div className={styles.root} data-theme={options.theme === 'auto' ? undefined : options.theme}>
        <div className={styles.backRow}>
          <a className={styles.controlButton} href={`/s/${encodeURIComponent(token)}`}>
            ← Back to the shared view
          </a>
        </div>
        <div className={styles.detail}>
          <SpeakerProfile
            speaker={speaker}
            sessions={sessionsForSpeaker(bundle.sessions, speaker)}
            timezone={bundle.event.timezone}
            showPhoto={options.showPhoto}
            sessionBase={`/s/${encodeURIComponent(token)}`}
          />
        </div>
      </div>
    </ShareFrame>
  );
}
