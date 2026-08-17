import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Code2, ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react';
import { CiceroBrand } from '@/components/CiceroBrand';
import { Button } from '@/components/ui';
import { appUrl } from '@/lib/env';
import { DEMO_EVENT_SLUG } from '@/lib/demo-entry-links';
import { getPublicExhibitorMap } from '@/lib/services/exhibitor-map';
import { createSocialMetadata } from '@/lib/site-metadata';
import { CopyAgentPromptButton } from '../CopyAgentPromptButton';
import { loadPublicBundle } from '../embed/queries';
import { buildEmbedSamples, type EmbedSample } from './samples';
import styles from './embeds.module.css';

/**
 * The published sample embeds. Every frame below is the real widget route reading the real seeded
 * conference, so the page cannot drift from the product the way a screenshot does — and the snippet
 * under each one is the snippet that produced it.
 *
 * The route is `/embeds`, one letter off the `/embed/*` widget routes it showcases. That adjacency
 * is deliberate and the collision it implies is the same one every static root route already has:
 * a published event whose organizer picks this slug is shadowed by the file-system route, exactly
 * as `/signin`, `/signup` and `/events` shadow theirs.
 */

export const dynamic = 'force-dynamic';

const TITLE = 'Live embed samples · Cicero';
const DESCRIPTION =
  'Every Cicero embed — speaker gallery, agenda, sessions, sponsors — running live against a real conference, with the snippet that produces each one.';

export function generateMetadata(): Metadata {
  return createSocialMetadata({
    origin: appUrl(),
    path: '/embeds',
    title: TITLE,
    description: DESCRIPTION,
  });
}

export default async function EmbedsPage() {
  const [bundle, exhibitorMap] = await Promise.all([
    loadPublicBundle(DEMO_EVENT_SLUG),
    getPublicExhibitorMap(DEMO_EVENT_SLUG),
  ]);

  const samples = bundle
    ? buildEmbedSamples(DEMO_EVENT_SLUG, appUrl(), {
        sessions: bundle.sessions.length,
        speakers: bundle.speakers.length,
        sponsors: bundle.sponsors?.length ?? 0,
        hasExhibitorMap: Boolean(exhibitorMap?.file),
      })
    : [];

  return <EmbedsShowcase samples={samples} eventName={bundle?.event.name ?? null} />;
}

/** Split out so the markup renders in a test without a database, as `HomeContent` does. */
export function EmbedsShowcase({
  samples,
  eventName,
}: {
  samples: EmbedSample[];
  eventName: string | null;
}) {
  const conference = eventName ?? 'the demo conference';

  return (
    <main className={styles.root}>
      <nav className={styles.nav} aria-label="Primary navigation">
        <Link className={styles.brand} href="/" aria-label="Cicero home">
          <CiceroBrand markSize={34} />
        </Link>
        <div className={styles.navLinks}>
          <Link className={styles.navLink} href="/#products">
            Products
          </Link>
          {samples.length > 0 ? (
            <Link className={styles.navLink} href={`/${DEMO_EVENT_SLUG}`}>
              Demo
            </Link>
          ) : null}
          <Button className={styles.navCta} href="/signup" variant="primary" size="sm">
            Sign up
          </Button>
        </div>
      </nav>

      <header className={styles.hero}>
        <p className={styles.eyebrow}>Sample embeds</p>
        <h1>Put the programme on your event website.</h1>
        <p className={styles.heroLead}>
          {samples.length > 0
            ? `Every view below is live — the same widget your visitors would load, reading ${conference} as it stands right now. Copy a snippet and it renders your event instead.`
            : 'Cicero publishes the agenda, sessions, speakers, gallery, and sponsor wall as widgets you can drop into any page.'}
        </p>
        <ul className={styles.heroFacts}>
          <li>
            <RefreshCw size={17} aria-hidden="true" />
            Live on every page load — no snapshot to re-paste when the schedule changes.
          </li>
          <li>
            <ShieldCheck size={17} aria-hidden="true" />
            Published data only: approved, scheduled, published sessions and confirmed speakers.
          </li>
        </ul>
      </header>

      {samples.length > 0 ? (
        <>
          <ul className={styles.jumpList} aria-label="Sample embeds on this page">
            {samples.map((sample) => (
              <li key={sample.view}>
                <a href={`#${sample.view}`}>{sample.label}</a>
              </li>
            ))}
          </ul>

          <div className={styles.samples}>
            {samples.map((sample) => (
              <SampleCard key={sample.view} sample={sample} conference={conference} />
            ))}
          </div>

          <section className={styles.outro}>
            <h2>Build your own.</h2>
            <p>
              The embed studio in the organizer workspace filters by track, room, day, or speaker,
              restyles the widget to match your site, and hands back the same two snippets.
            </p>
            <div className={styles.outroActions}>
              <Button
                href="/organizer/embeds"
                variant="primary"
                size="lg"
                iconRight={<ArrowRight size={17} aria-hidden="true" />}
              >
                Open the embed studio
              </Button>
              <Button href={`/${DEMO_EVENT_SLUG}`} size="lg">
                See the attendee site
              </Button>
            </div>
          </section>
        </>
      ) : (
        <section className={styles.freshStart}>
          <p className={styles.eyebrow}>Fresh instance</p>
          <h2>No published programme to sample yet.</h2>
          <p>
            These samples read a real event, and this instance has none published. Create an event
            and publish a session, or load the demo fixture from the README, and every view above
            becomes available at <code>/embed/&lt;your-event&gt;/&lt;view&gt;</code>.
          </p>
          <div className={styles.outroActions}>
            <Button
              href="/signup"
              variant="primary"
              size="lg"
              iconRight={<ArrowRight size={17} aria-hidden="true" />}
            >
              Create an event
            </Button>
            <Button href="/" size="lg">
              Back to the home page
            </Button>
          </div>
        </section>
      )}
    </main>
  );
}

function SampleCard({ sample, conference }: { sample: EmbedSample; conference: string }) {
  return (
    <article className={styles.sample} id={sample.view}>
      <div className={styles.sampleHead}>
        <h2>{sample.label}</h2>
        <p>{sample.summary}</p>
        <div className={styles.sampleLinks}>
          {sample.publicPath ? (
            <Link className={styles.textLink} href={sample.publicPath}>
              As a full page <ArrowRight size={15} aria-hidden="true" />
            </Link>
          ) : null}
          {/* A plain anchor: the widget route is a bare document meant to be loaded whole, not a
              page of this app to soft-navigate into. */}
          <a className={styles.textLink} href={sample.framePath}>
            The embed on its own <ExternalLink size={15} aria-hidden="true" />
          </a>
        </div>
      </div>

      <div className={styles.frameShell}>
        <div className={styles.windowBar} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        {/*
          A plain iframe rather than the `embed.js` snippet beside it. The script mounts nothing
          until it runs, which would leave this page blank on first paint and empty to a crawler,
          and its one advantage — sizing the frame from the widget's own height — is worth nothing
          here where the height is a fixed presentation choice.
        */}
        <iframe
          className={styles.frame}
          src={sample.framePath}
          title={`${sample.label} — live embed of ${conference}`}
          style={{ height: `${sample.frameHeight}px` }}
          loading="lazy"
        />
      </div>

      <div className={styles.snippet}>
        <div className={styles.snippetHead}>
          <span className={styles.snippetLabel}>
            <Code2 size={16} aria-hidden="true" />
            Paste into your event website
          </span>
          <CopyAgentPromptButton
            prompt={sample.scriptSnippet}
            label="Copy snippet"
            copiedSubject="Snippet"
            icon="snippet"
          />
        </div>
        <pre>
          <code>{sample.scriptSnippet}</code>
        </pre>
        <details className={styles.alternate}>
          <summary>Site strips script tags? Use the iframe instead</summary>
          <pre>
            <code>{sample.iframeSnippet}</code>
          </pre>
          <CopyAgentPromptButton
            prompt={sample.iframeSnippet}
            label="Copy iframe"
            copiedSubject="Iframe"
            icon="snippet"
          />
        </details>
      </div>
    </article>
  );
}
