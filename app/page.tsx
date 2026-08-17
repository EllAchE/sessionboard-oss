import { CiceroBrand } from '@/components/CiceroBrand';
import { Button } from '@/components/ui';
import publicAgendaImage from '@/docs/images/public-agenda.jpg';
import dashboardImage from '@/docs/images/submission-evidence/local-seeded-organizer.png';
import { demoEntryPointsAreAvailable } from '@/lib/demo-availability';
import { DEMO_ENTRY_LINKS } from '@/lib/demo-entry-links';
import {
  ArrowRight,
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  ExternalLink,
  FileCheck,
  Github,
  Globe2,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  Plug,
  ShieldCheck,
  Sparkles,
  UserPlus,
  UserRound,
} from 'lucide-react';
import Image from 'next/image';
import { CopyAgentPromptButton } from './CopyAgentPromptButton';
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

const ORGANIZER_FEATURES = [
  {
    icon: <LayoutDashboard size={20} aria-hidden="true" />,
    title: 'Know what needs attention',
    body: 'See live counts, blocked speakers, overdue work, and the next action—not a wall of decorative metrics.',
  },
  {
    icon: <ClipboardCheck size={20} aria-hidden="true" />,
    title: 'Review with the right structure',
    body: 'Route proposals into scored rounds, assign reviewers, preserve blind review, and make decisions in bulk or one at a time.',
  },
  {
    icon: <CalendarCheck size={20} aria-hidden="true" />,
    title: 'Build a schedule that catches collisions',
    body: 'Drag sessions onto rooms and times while Cicero flags room, track, and speaker conflicts before they reach the public agenda.',
  },
  {
    icon: <Globe2 size={20} aria-hidden="true" />,
    title: 'Publish without copying data',
    body: 'Turn the working schedule into public session, speaker, agenda, and embed views that stay in sync.',
  },
];

const SPEAKER_FEATURES = [
  {
    icon: <FileCheck size={20} aria-hidden="true" />,
    title: 'Submit without a setup detour',
    body: 'Start from the public call, save a draft, create an account in the flow, and return without starting over.',
  },
  {
    icon: <UserRound size={20} aria-hidden="true" />,
    title: 'Find everything in one portal',
    body: 'Keep your bio, headshot, sessions, resources, and organizer requests together instead of searching old email threads.',
  },
  {
    icon: <ListChecks size={20} aria-hidden="true" />,
    title: 'Send the right files every time',
    body: 'Upload slides and documents with version history, organizer comments, and a clear completion state.',
  },
  {
    icon: <CalendarDays size={20} aria-hidden="true" />,
    title: 'Stay ready for the day',
    body: 'See outstanding tasks, download calendar invitations, and receive schedule updates without duplicate calendar events.',
  },
];

const ROLE_PRODUCTS = [
  {
    icon: LayoutDashboard,
    role: 'Organizer',
    title: 'Keep the whole conference moving.',
    body: 'Manage proposals, reviews, schedules, communications, and speaker follow-up.',
  },
  {
    icon: Megaphone,
    role: 'Speaker',
    title: 'Stay ready from proposal to stage.',
    body: 'Submit a talk, maintain your profile, send deliverables, and upload your slides.',
  },
  {
    icon: CalendarDays,
    role: 'Attendee',
    title: 'Plan the day from the live programme.',
    body: 'Browse the agenda, discover speakers, and build a personal itinerary, no account needed.',
  },
] as const;

/**
 * The seeded demo identities (`lib/demo-entry-links.ts`), surfaced above the fold so a first-time
 * visitor reaches a populated view of the role they care about without reading the page first. The
 * same three entry points also close the page and sit in the global footer.
 *
 * `label` leads with a verb rather than the role noun on purpose, and the role noun opens `blurb`
 * instead. Automated walkthroughs pick a click target by matching label text from the start and
 * treat two matches as an error rather than choosing between them, and the footer already ships
 * `Organizer demo`, `Reviewer demo`, and `Speaker demo` on this same page. That rules out the role
 * nouns and their stems here -- `Organize`, `Review` and `Speak` are each still a prefix of the
 * matching footer label -- so `Run`, `Score` and `Give` keep all six entry points separable at their
 * first word. Only the start of the link text disambiguates, so naming the role inside `blurb`
 * stays clear for a reader without reintroducing the clash. Re-check the whole page before
 * rewording any of these.
 */
const PERSONAS = [
  {
    href: DEMO_ENTRY_LINKS.organizer,
    icon: LayoutDashboard,
    label: 'Run the conference',
    blurb: 'Organizer — programme, schedule, and outstanding tasks.',
  },
  {
    href: DEMO_ENTRY_LINKS.reviewer,
    icon: ClipboardCheck,
    label: 'Score the proposals',
    blurb: 'Reviewer — assigned proposals and scoring.',
  },
  {
    href: DEMO_ENTRY_LINKS.speaker,
    icon: Megaphone,
    label: 'Give a talk',
    blurb: 'Speaker — your sessions, profile, and tasks.',
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
        <div className={styles.navLinks}>
          <a className={styles.productsLink} href="#products">
            Products
          </a>
          <a className={styles.aboutLink} href="#about">
            About
          </a>
          {demoAvailable ? (
            <a className={styles.demoLink} href="/demo">
              Demo
            </a>
          ) : null}
          <a className={styles.apiDocsLink} href="/api/v1/openapi.json">
            Docs
          </a>
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
          <h1>From call for speakers to public program</h1>
          <p className={styles.heroLead}>
            Run submissions, review, scheduling, speaker tasks, and publishing in one place.
          </p>
          <div className={styles.agentStarter}>
            <div className={styles.agentStarterCopy}>
              <p className={styles.agentStarterLabel}>
                <Sparkles size={17} aria-hidden="true" />
                Agent-first
              </p>
              <p>
                Let Claude or ChatGPT set Cicero up and run it for you over MCP, one safe step at a
                time.
              </p>
            </div>
            <CopyAgentPromptButton
              prompt={AGENT_STARTER_PROMPT}
              label="Copy AI setup prompt"
              copiedLabel="AI setup prompt copied"
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

          {demoAvailable ? (
            <div className={styles.personas}>
              <p className={styles.personasTitle} id="personas-title">
                Or explore a conference already in progress
              </p>
              <ul className={styles.personaList} aria-labelledby="personas-title">
                {PERSONAS.map((persona) => (
                  <li key={persona.label}>
                    <a className={styles.persona} href={persona.href}>
                      <span className={styles.personaIcon}>
                        <persona.icon size={18} aria-hidden="true" />
                      </span>
                      <span className={styles.personaLabel}>
                        {persona.label}
                        <ArrowRight size={15} aria-hidden="true" />
                      </span>
                      <span className={styles.personaBlurb}>{persona.blurb}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className={styles.freshStart}>
              <p className={styles.personasTitle}>Fresh instance</p>
              <p>No demo event yet. Create an event or load demo data from the README.</p>
            </div>
          )}
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
          <h2 id="products-title">One conference, three purpose-built experiences.</h2>
          <p>
            Everyone works from the same event, while each person sees the tools and context that
            belong to their role.
          </p>
        </div>
        <div className={styles.roleProducts}>
          {ROLE_PRODUCTS.map(({ icon: Icon, role, title, body }) => (
            <article className={`${styles.feature} ${styles.roleProduct}`} key={role}>
              <span className={styles.featureIcon}>
                <Icon size={20} aria-hidden="true" />
              </span>
              <p className={styles.roleProductRole}>{role}</p>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.product} id="organizers">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>
            <LayoutDashboard size={17} aria-hidden="true" />
            For organizers
          </p>
          <h2>Keep the entire conference moving.</h2>
          <p>
            Cicero links the operational work that breaks across forms, spreadsheets,
            inboxes, and scheduling tools so every handoff carries the right context forward.
          </p>
        </div>
        <div className={styles.features}>
          {ORGANIZER_FEATURES.map((feature) => (
            <article className={styles.feature} key={feature.title}>
              <span className={styles.featureIcon}>{feature.icon}</span>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.programme}>
        <div className={styles.programmeVisual}>
          <Image
            src={publicAgendaImage}
            alt="A public Cicero agenda laid out by time and room"
            sizes="(max-width: 820px) 94vw, 58vw"
          />
        </div>
        <div className={styles.programmeCopy}>
          <p className={styles.eyebrow}>For organizers</p>
          <h2>Publish once. Keep every public view in sync.</h2>
          <p>
            The agenda, session pages, speaker directory, and website embeds all read from the
            programme your team already manages in Cicero.
          </p>
          <a className={styles.textLink} href={demoAvailable ? '/demo/agenda' : '/signup'}>
            {demoAvailable ? 'Explore the demo programme' : 'Publish your first programme'}{' '}
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
      </section>

      <section className={`${styles.product} ${styles.speakerProduct}`} id="speakers">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>
            <Megaphone size={17} aria-hidden="true" />
            For speakers
          </p>
          <h2>Give speakers one clear place to get ready.</h2>
          <p>
            Speakers can submit, update their profile, deliver files, and track what is left
            without asking an organizer to relay every step by email.
          </p>
        </div>
        <div className={styles.features}>
          {SPEAKER_FEATURES.map((feature) => (
            <article className={styles.feature} key={feature.title}>
              <span className={styles.featureIcon}>{feature.icon}</span>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
        {demoAvailable ? (
          <a className={styles.textLink} href={DEMO_ENTRY_LINKS.speaker}>
            Explore the speaker portal <ArrowRight size={16} aria-hidden="true" />
          </a>
        ) : null}
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
            <a className={styles.textLink} href="/api/v1/mcp-tools.json">
              Browse the MCP tools <ArrowRight size={16} aria-hidden="true" />
            </a>
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
              Setup prompt
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

      {demoAvailable ? (
        <section className={styles.finalCta}>
          <p className={styles.eyebrow}>See both sides</p>
          <h2>Explore a conference already in motion.</h2>
          <p>See how organizers move the event forward and how speakers get ready.</p>
          <div className={styles.finalCtaActions}>
            <Button
              href={DEMO_ENTRY_LINKS.organizer}
              variant="primary"
              size="lg"
              iconRight={<ArrowRight size={17} aria-hidden="true" />}
            >
              Open the organizer dashboard
            </Button>
            <Button
              href={DEMO_ENTRY_LINKS.speaker}
              size="lg"
              iconRight={<ArrowRight size={17} aria-hidden="true" />}
            >
              Prepare a talk as a speaker
            </Button>
          </div>
        </section>
      ) : (
        <section className={styles.finalCta}>
          <p className={styles.eyebrow}>Ready for its first event</p>
          <h2>Run your own conference.</h2>
          <p>
            This fresh instance is fully operational without fixture data. Create an account to
            build the first event, or sign in if another organizer has already invited you.
          </p>
          <div className={styles.finalCtaActions}>
            <Button
              href="/signup"
              variant="primary"
              size="lg"
              iconRight={<ArrowRight size={17} aria-hidden="true" />}
            >
              Create your first event
            </Button>
            <Button href="/signin" size="lg">
              Sign in
            </Button>
          </div>
        </section>
      )}

    </main>
  );
}
