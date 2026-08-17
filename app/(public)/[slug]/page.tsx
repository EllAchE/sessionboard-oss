import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { listOpenCalls } from '@/lib/services/submissions';
import { appUrl } from '@/lib/env';
import { createSocialMetadata } from '@/lib/site-metadata';
import { describeEventDeadlines } from '@/lib/event-deadlines';
import { EmbedBody } from '../../embed/EmbedBody';
import { loadPublicBundle, parseEmbedOptions } from '../../embed/queries';
import { PublicChrome, publicStyles as styles } from './PublicChrome';

export const dynamic = 'force-dynamic';

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const bundle = await loadPublicBundle(slug);
  if (!bundle) return { title: 'Event not found' };
  return createSocialMetadata({
    origin: appUrl(),
    path: `/${bundle.event.slug}`,
    title: bundle.event.name,
    description: bundle.event.tagline ?? `The programme for ${bundle.event.name}.`,
  });
}

/** `G-4`. The public front door: the same published-only data the embeds serve. */
export default async function PublicEventPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const bundle = await loadPublicBundle(slug);
  if (!bundle) notFound();

  const { event } = bundle;
  const dates = [event.startsOn, event.endsOn].filter(Boolean).join(' – ');
  const deadlines = describeEventDeadlines(event);
  const options = parseEmbedOptions({ limit: '6', columns: '3' });
  const [call] = await listOpenCalls(event.id);

  return (
    <PublicChrome event={event} active="home">
      {/* `E-3`. Decorative: everything it carries is in the heading directly beneath it. */}
      {event.bannerUrl ? (
        <div className={styles.banner}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a route handler serves this, not the image optimiser */}
          <img src={event.bannerUrl} alt="" className={styles.bannerImage} />
        </div>
      ) : null}
      <section className={styles.hero}>
        <h1 className={styles.heroTitle}>{event.name}</h1>
        {event.tagline ? <p className={styles.heroTagline}>{event.tagline}</p> : null}
        <div className={styles.heroMeta}>
          {event.eventType ? <span>{event.eventType}</span> : null}
          {dates ? <span>{dates}</span> : null}
          {event.venueName ? <span>{event.venueName}</span> : null}
          <span>{event.timezone.replace('_', ' ')}</span>
        </div>
        <div className={styles.heroActions}>
          {call ? (
            <Link
              href={`/submit/${event.slug}/${call.slug}`}
              className={styles.action}
              data-primary="true"
            >
              Submit a talk
            </Link>
          ) : null}
          <Link
            href={`/${event.slug}/agenda`}
            className={styles.action}
            data-primary={call ? undefined : 'true'}
          >
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

      {/*
        `AR-50`. The two milestones the organizers set for themselves, shown here because "when will
        the full agenda be up?" is the question this page gets asked and cannot otherwise answer.
        Nothing published here is a commitment the product enforces — see `lib/event-deadlines.ts`.
      */}
      {deadlines.length > 0 ? (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Key dates</h2>
          </div>
          <ul className={styles.keyDates}>
            {deadlines.map((deadline) => (
              <li key={deadline.key} className={styles.keyDate} data-passed={deadline.passed}>
                <span className={styles.keyDateLabel}>{deadline.publicLabel}</span>
                <span className={styles.keyDateWhen}>{deadline.when}</span>
                <span className={styles.keyDateRelative}>{deadline.relative}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
            speakerBase={`/${event.slug}/speakers`}
            sessionBase={`/${event.slug}/sessions`}
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
            speakerBase={`/${event.slug}/speakers`}
            sessionBase={`/${event.slug}/sessions`}
          />
        </section>
      ) : (
        <p className={styles.empty}>Programme not published yet.</p>
      )}
    </PublicChrome>
  );
}
