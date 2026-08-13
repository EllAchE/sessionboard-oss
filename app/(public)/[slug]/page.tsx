import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { listOpenCalls } from '@/lib/services/submissions';
import { appUrl } from '@/lib/env';
import { createSocialMetadata } from '@/lib/site-metadata';
import { EmbedBody } from '../../embed/EmbedBody';
import { loadPublicBundle, parseEmbedOptions } from '../../embed/queries';
import { ConferenceCountdown } from './ConferenceCountdown';
import { PublicChrome, publicStyles as styles } from './PublicChrome';

export const dynamic = 'force-dynamic';

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const bundle = await loadPublicBundle(slug);
  if (!bundle) return { title: 'Assembly absent from the annals' };
  return createSocialMetadata({
    origin: appUrl(),
    path: `/${bundle.event.slug}`,
    title: bundle.event.name,
    description: bundle.event.tagline ?? `The public fasti for ${bundle.event.name}.`,
  });
}

/** `G-4`. The public front door: the same published-only data the embeds serve. */
export default async function PublicEventPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const bundle = await loadPublicBundle(slug);
  if (!bundle) notFound();

  const { event } = bundle;
  const dates = [event.startsOn, event.endsOn].filter(Boolean).join(' – ');
  const options = parseEmbedOptions({ limit: '6', columns: '3' });
  const [call] = await listOpenCalls(event.id);

  return (
    <PublicChrome event={event} active="home">
      <section className={styles.hero}>
        <h1 className={styles.heroTitle}>{event.name}</h1>
        {event.tagline ? <p className={styles.heroTagline}>{event.tagline}</p> : null}
        <div className={styles.heroMeta}>
          {dates ? <span>{dates}</span> : null}
          {event.venueName ? <span>{event.venueName}</span> : null}
          <span>{event.timezone.replace('_', ' ')}</span>
        </div>
        {event.startsOn ? (
          <ConferenceCountdown
            startsOn={event.startsOn}
            endsOn={event.endsOn}
            timeZone={event.timezone}
            initialNow={Date.now()}
          />
        ) : null}
        <div className={styles.heroActions}>
          {call ? (
            <Link
              href={`/submit/${event.slug}/${call.slug}`}
              className={styles.action}
              data-primary="true"
            >
              Propose an oration
            </Link>
          ) : null}
          <Link
            href={`/${event.slug}/agenda`}
            className={styles.action}
            data-primary={call ? undefined : 'true'}
          >
            Consult the fasti
          </Link>
          <Link href={`/${event.slug}/speakers`} className={styles.action}>
            Meet the orators
          </Link>
          {event.websiteUrl ? (
            <a href={event.websiteUrl} className={styles.action} rel="noreferrer" target="_blank">
              Official event scroll
            </a>
          ) : null}
        </div>
        <div className={styles.statRow}>
          <span className={styles.stat}>
            <span className={styles.statValue}>{bundle.sessions.length}</span>
            <span className={styles.statLabel}>Orations</span>
          </span>
          <span className={styles.stat}>
            <span className={styles.statValue}>{bundle.speakers.length}</span>
            <span className={styles.statLabel}>Orators</span>
          </span>
          {bundle.tracks.length > 0 ? (
            <span className={styles.stat}>
              <span className={styles.statValue}>{bundle.tracks.length}</span>
              <span className={styles.statLabel}>Themes</span>
            </span>
          ) : null}
        </div>
      </section>

      {bundle.speakers.length > 0 ? (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Orators of distinction</h2>
            <Link href={`/${event.slug}/speakers`} className={styles.sectionLink}>
              All {bundle.speakers.length} orators →
            </Link>
          </div>
          <EmbedBody
            view="gallery"
            bundle={{ ...bundle, speakers: bundle.speakers.slice(0, 6) }}
            options={{ ...options, showBio: false }}
            speakerBase={`/${event.slug}/speakers`}
            sessionBase={`/${event.slug}/sessions`}
          />
        </section>
      ) : null}

      {bundle.sessions.length > 0 ? (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Before the assembly</h2>
            <Link href={`/${event.slug}/agenda`} className={styles.sectionLink}>
              Consult the full fasti →
            </Link>
          </div>
          <EmbedBody
            view="sessions"
            bundle={{ ...bundle, sessions: bundle.sessions.slice(0, 6) }}
            options={{ ...options, columns: 2, showDescription: false }}
            speakerBase={`/${event.slug}/speakers`}
            sessionBase={`/${event.slug}/sessions`}
          />
        </section>
      ) : (
        <p className={styles.empty}>The programme remains under seal. Return when the heralds have spoken.
        </p>
      )}
    </PublicChrome>
  );
}
