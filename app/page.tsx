import { CiceroBrand } from '@/components/CiceroBrand';
import { Button } from '@/components/ui';
import dashboardImage from '@/docs/images/submission-evidence/local-seeded-organizer.png';
import { demoEntryPointsAreAvailable } from '@/lib/demo-availability';
import { DEMO_ENTRY_LINKS, DEMO_PUBLIC_SITE_LINK } from '@/lib/demo-entry-links';
import {
  ArrowRight,
  CalendarDays,
  ClipboardCheck,
  ExternalLink,
  Github,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  Plug,
  ShieldCheck,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import Image from 'next/image';
import { CopyAgentPromptButton } from './CopyAgentPromptButton';
import { DemoMenu } from './DemoMenu';
import styles from './home.module.css';

/**
 * Deliberately one instruction and one URL. The guide at that URL already owns resuming from saved
 * state, asking only for unknown facts, one milestone at a time, and confirmation before any live
 * change -- restating those rules here only gave the page a wall of text to render and a second
 * copy to keep in sync. Anything this prompt should do belongs in `onboard-cicero/SKILL.md`.
 */
const AGENT_STARTER_PROMPT = `Set up Cicero for my conference, then connect its MCP server so you can run the event for me. Follow the guide at https://github.com/EllAchE/sessionboard-oss/blob/main/.agents/skills/onboard-cicero/SKILL.md`;

/** Event-scoped by construction, so the slug stays a placeholder until the organizer has an event. */
const MCP_ENDPOINT = '/api/v1/events/{event-slug}/mcp';

/**
 * The four ways into the seeded demo event (`lib/demo-entry-links.ts`), one per product role. This
 * section is the only place in the page body that links to the demo: the hero makes the argument,
 * these cards let a visitor open the role they actually care about. The attendee card comes last
 * because it is what the other three produce, and it is the only one that opens without an account.
 *
 * `linkLabel` leads with a verb rather than the role noun on purpose, and the role noun is the card
 * label instead. Automated walkthroughs pick a click target by matching link text from its start and
 * treat two matches as an error rather than choosing between them, and the global footer already
 * ships `Organizer demo`, `Reviewer demo`, and `Speaker demo` on this same page. That rules out the
 * role nouns and their stems here -- `Organize`, `Review`, and `Speak` are each still a prefix of
 * the matching footer label -- so `Run`, `Score`, `Give`, and `Browse` keep all seven entry points
 * separable at their first word. It is also why the link sits at the foot of the card rather than
 * the whole card being an anchor: a card-wide link would take the role noun as its text and clash.
 * Re-check the page and the footer together before rewording any of these.
 */
const ROLE_PRODUCTS = [
  {
    icon: LayoutDashboard,
    role: 'Organizer',
    title: 'Keep the whole conference moving.',
    body: 'Manage proposals, reviews, schedules, communications, and speaker follow-up.',
    href: DEMO_ENTRY_LINKS.organizer,
    linkLabel: 'Run the organizer dashboard',
  },
  {
    icon: ClipboardCheck,
    role: 'Reviewer',
    title: 'Score proposals, not spreadsheets.',
    body: 'Work an assigned queue, rate the round’s criteria, and stay blind to peer scores until it closes.',
    href: DEMO_ENTRY_LINKS.reviewer,
    linkLabel: 'Score the review queue',
  },
  {
    icon: Megaphone,
    role: 'Speaker',
    title: 'Stay ready from proposal to stage.',
    body: 'Submit a talk, maintain your profile, send deliverables, and upload your slides.',
    href: DEMO_ENTRY_LINKS.speaker,
    linkLabel: 'Give a talk from the portal',
  },
  {
    icon: CalendarDays,
    role: 'Attendee',
    title: 'Plan the day from the live programme.',
    body: 'Browse the agenda, discover speakers, and build a personal itinerary, no account needed.',
    href: `${DEMO_PUBLIC_SITE_LINK}/agenda`,
    linkLabel: 'Browse the public agenda',
  },
] as const;

export default async function Home() {
  return <HomeContent demoAvailable={await demoEntryPointsAreAvailable()} />;
}

export function HomeContent({ demoAvailable }: { demoAvailable: boolean }) {
  return (
    <main className={styles.root}>
      <nav className={styles.nav} aria-label="Primary navigation">
        <a className={styles.brand} href="/" aria-label="Cicero home">
          <CiceroBrand markSize={34} />
        </a>
        {/*
          Demo sits last because it is the only entry that leaves the marketing page for a live
          product surface, and because it opens a menu rather than jumping to a section -- a
          trigger that expands in place reads as the end of the row, not a step in it.
        */}
        <div className={styles.navLinks}>
          <a className={styles.aboutLink} href="#about">
            About
          </a>
          <a className={styles.productsLink} href="#products">
            Product
          </a>
          <a className={styles.apiDocsLink} href="/docs/api">
            API
          </a>
          {demoAvailable ? <DemoMenu className={styles.demoLink} /> : null}
        </div>
        <div className={styles.navAuth}>
          <Button
            className={styles.navSignIn}
            href="/signin"
            variant="secondary"
            size="sm"
          >
            Sign in
          </Button>
          <Button
            className={styles.navCta}
            href="/signup"
            variant="primary"
            size="sm"
          >
            Sign up
          </Button>
        </div>
      </nav>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Conference operations, end to end</p>
          <h1>From call for speakers to first day</h1>
          <p className={styles.heroLead}>
            Manage submissions, review, sourcing, scheduling, speaker tasks, and publishing in one place.
          </p>
          <div className={styles.agentStarter}>
            <p className={styles.agentStarterLabel}>
              <Sparkles size={17} aria-hidden="true" />
              AI-guided setup
            </p>
            <CopyAgentPromptButton
              prompt={AGENT_STARTER_PROMPT}
              size="lg"
              variant="primary"
            />
          </div>
          <div className={styles.manualStart}>
            <span>Prefer to start in the app?</span>
            <Button
              href="/signup"
              size="lg"
              iconRight={<UserPlus size={17} aria-hidden="true" />}
            >
              Create an event
            </Button>
          </div>
        </div>

        <div className={styles.heroVisual} aria-label="Cicero organizer dashboard preview">
          <div className={styles.windowBar} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className={styles.heroImageFrame}>
            <Image
              className={styles.heroImage}
              src={dashboardImage}
              alt="Cicero organizer dashboard showing event progress and outstanding tasks"
              priority
              sizes="(max-width: 760px) 94vw, (max-width: 1100px) 88vw, 1080px"
            />
          </div>
          <div className={`${styles.callout} ${styles.calloutTasks}`}>
            <ListChecks size={17} aria-hidden="true" />
            <span>See the next action immediately</span>
          </div>
          <div className={`${styles.callout} ${styles.calloutSchedule}`}>
            <LayoutDashboard size={17} aria-hidden="true" />
            <span>Review, speakers, and schedule in one view</span>
          </div>
        </div>
      </section>

      <div className={styles.mosaicRule} aria-hidden="true" />

      <section
        className={styles.productsOverview}
        id="products"
        aria-labelledby="products-title"
      >
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>Products by role</p>
          <h2 id="products-title">One conference, four purpose-built experiences.</h2>
          <p>
            Everyone works from the same event, while each person sees the tools and context that
            belong to their role. Open any of them in the seeded demo conference.
          </p>
        </div>
        <div className={styles.roleProducts}>
          {ROLE_PRODUCTS.map(({ icon: Icon, role, title, body, href, linkLabel }) => (
            <article className={`${styles.feature} ${styles.roleProduct}`} key={role}>
              <span className={styles.featureIcon}>
                <Icon size={20} aria-hidden="true" />
              </span>
              <p className={styles.roleProductRole}>{role}</p>
              <h3>{title}</h3>
              <p>{body}</p>
              {demoAvailable ? (
                <a className={styles.textLink} href={href}>
                  {linkLabel} <ArrowRight size={16} aria-hidden="true" />
                </a>
              ) : null}
            </article>
          ))}
        </div>
        {demoAvailable ? null : (
          <div className={styles.freshStart}>
            <p className={styles.freshStartTitle}>Fresh instance</p>
            <p>
              No demo event yet, so there is nothing to tour. Create an event or load demo data from
              the README.
            </p>
            <a className={styles.textLink} href="/signup">
              Start your first event <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
        )}
      </section>

      <section className={styles.about} id="about" aria-labelledby="about-title">
        <div className={styles.aboutHeading}>
          <p className={styles.eyebrow}>Open source and self-hostable</p>
          <h2 id="about-title">Build on the workflow, not around it.</h2>
        </div>
        <div className={styles.aboutBody}>
          <p>
            Connect Cicero to the tools your event already uses, publish live views anywhere, and
            extend the workflow without waiting on a vendor roadmap.
          </p>
          <dl className={styles.aboutFacts}>
            <div>
              <dt>Automate</dt>
              <dd>REST API and webhooks</dd>
            </div>
            <div>
              <dt>Publish</dt>
              <dd>Live embeddable views</dd>
            </div>
            <div>
              <dt>Adapt</dt>
              <dd>Role-scoped agents</dd>
            </div>
          </dl>
          <div className={styles.aboutLinks}>
            <a className={styles.textLink} href="#agent-quick-start">
              Set up with an AI guide <ArrowRight size={16} aria-hidden="true" />
            </a>
            <a
              className={styles.textLink}
              href="https://github.com/EllAchE/sessionboard-oss"
            >
              View source on GitHub <Github size={16} aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>

      <section
        className={styles.agentQuickStart}
        id="agent-quick-start"
        aria-labelledby="agent-quick-start-title"
      >
        <div className={styles.agentQuickIntro}>
          <p className={styles.eyebrow}>
            <Sparkles size={17} aria-hidden="true" />
            For organizers · Agent-first
          </p>
          <h2 id="agent-quick-start-title">
            Let your AI assistant handle the hard work.
          </h2>
          <p>
            Cicero is built to be driven by an agent. Connect its MCP server and Claude or ChatGPT
            works the event itself — reading submissions, reconciling the program, drafting speaker
            email — instead of narrating what you should click.
          </p>

          <ol className={styles.agentSteps}>
            <li>
              <span className={styles.agentStepNumber}>1</span>
              <div className={styles.agentStepCopy}>
                <h3>Copy one line</h3>
                <p>Paste it into Claude or ChatGPT. The guide sets up hosting and your event.</p>
              </div>
            </li>
            <li>
              <span className={styles.agentStepNumber}>2</span>
              <div className={styles.agentStepCopy}>
                <h3>Create a key</h3>
                <p>
                  Organizer → <strong>Integrations</strong> → Create key. Read-only or read and
                  write; shown once, hashed at rest.
                </p>
              </div>
            </li>
            <li>
              <span className={styles.agentStepNumber}>3</span>
              <div className={styles.agentStepCopy}>
                <h3>Connect the MCP</h3>
                <p>Point your client at your event’s URL. Ten tools, scoped by that key.</p>
              </div>
            </li>
          </ol>

          <div className={styles.agentLinks}>
            <a
              className={styles.textLink}
              href="https://github.com/EllAchE/sessionboard-oss/tree/main/.agents/skills/onboard-cicero"
              target="_blank"
              rel="noreferrer"
            >
              Read the onboarding guide <ExternalLink size={16} aria-hidden="true" />
            </a>
            <a
              className={styles.textLink}
              href="https://github.com/EllAchE/sessionboard-oss/blob/main/.agents/skills/manage-cicero-event/references/first-settlement-demo.md"
              target="_blank"
              rel="noreferrer"
            >
              See the full walkthrough <ExternalLink size={16} aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className={styles.agentPrompt}>
          <div className={styles.agentPromptHeader}>
            <span className={styles.agentPromptLabel}>
              <Plug size={17} aria-hidden="true" />
              MCP server
            </span>
            <a className={styles.textLink} href="/api/v1/mcp-tools.json">
              Tool manifest
            </a>
          </div>
          <pre>
            <code>{MCP_ENDPOINT}</code>
          </pre>
          <p className={styles.agentPromptNote}>
            <KeyRound size={17} aria-hidden="true" />
            Streamable HTTP, authenticated with an event API key as a Bearer token. Keys are
            event-scoped, so you need your own event first — the prompt below gets you there.
          </p>

          <div className={styles.agentPromptHeader}>
            <span className={styles.agentPromptLabel}>
              <Sparkles size={17} aria-hidden="true" />
              Claude &amp; ChatGPT setup prompt
            </span>
            <CopyAgentPromptButton prompt={AGENT_STARTER_PROMPT} />
          </div>
          <pre>
            <code>{AGENT_STARTER_PROMPT}</code>
          </pre>
          <p className={styles.agentPromptSafety}>
            <ShieldCheck size={17} aria-hidden="true" />
            Changes and deletions require confirmation.
          </p>
        </div>
      </section>
    </main>
  );
}
