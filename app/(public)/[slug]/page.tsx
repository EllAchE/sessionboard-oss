import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { EmbedBody } from '../../embed/EmbedBody';
import { loadPublicBundle, parseEmbedOptions } from '../../embed/queries';
import { PublicChrome, publicStyles as styles } from './PublicChrome';

export const dynamic = 'force-dynamic';

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const bundle = await loadPublicBundle(slug);
  if (!bundle) return { title: 'Event not found' };
  return {
    title: bundle.event.name,
    description: bundle.event.tagline ?? `The programme for ${bundle.event.name}.`,
  };
}

/** `G-4`. The public front door: the same published-only data the embeds serve. */
export default async function PublicEventPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const bundle = await loadPublicBundle(slug);
  if (!bundle) notFound();

  const { event } = bundle;
  const dates = [event.startsOn, event.endsOn].filter(Boolean).join(' – ');
  const options = parseEmbedOptions({ limit: '6', columns: '3' });

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
        <div className={styles.heroActions}>
          <Link href={`/${event.slug}/agenda`} className={styles.action} data-primary="true">
            See the agenda
          </Link>
          <Link href={`/${event.slug}/speakers`} className={styles.action}>
            Meet the speakers
          </Link>
          {event.websiteUrl ? (
            <a href={event.websiteUrl} className={styles.action} rel="noreferrer" target="_blank">
              Event website
            </a>
          ) : null}
        </div>
        <div className={styles.statRow}>
          <span className={styles.stat}>
            <span className={styles.statValue}>{bundle.sessions.length}</span>
            <span className={styles.statLabel}>Sessions</span>
          </span>
          <span className={styles.stat}>
            <span className={styles.statValue}>{bundle.speakers.length}</span>
            <span className={styles.statLabel}>Speakers</span>
          </span>
          {bundle.tracks.length > 0 ? (
            <span className={styles.stat}>
              <span className={styles.statValue}>{bundle.tracks.length}</span>
              <span className={styles.statLabel}>Tracks</span>
            </span>
          ) : null}
        </div>
      </section>

      {bundle.speakers.length > 0 ? (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Featured speakers</h2>
            <Link href={`/${event.slug}/speakers`} className={styles.sectionLink}>
              All {bundle.speakers.length} speakers →
            </Link>
          </div>
          <EmbedBody
            view="gallery"
            bundle={{ ...bundle, speakers: bundle.speakers.slice(0, 6) }}
            options={{ ...options, showBio: false }}
          />
        </section>
      ) : null}

      {bundle.sessions.length > 0 ? (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>What is on</h2>
            <Link href={`/${event.slug}/agenda`} className={styles.sectionLink}>
              Full agenda →
            </Link>
          </div>
          <EmbedBody
            view="sessions"
            bundle={{ ...bundle, sessions: bundle.sessions.slice(0, 6) }}
            options={{ ...options, columns: 2, showDescription: false }}
          />
        </section>
      ) : (
        <p className={styles.empty}>The programme has not been published yet. Check back soon.</p>
      )}
    </PublicChrome>
  );
}
