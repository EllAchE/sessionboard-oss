import { CiceroBrand } from '@/components/CiceroBrand';
import { Button } from '@/components/ui';
import publicAgendaImage from '@/docs/images/public-agenda.jpg';
import dashboardImage from '@/docs/images/submission-evidence/local-seeded-organizer.png';
import { demoEntryPointsAreAvailable } from '@/lib/demo-availability';
import {
  DEMO_ENTRY_LINKS,
  DEMO_EVENT_SLUG,
  DEMO_PUBLIC_LINKS,
  DEMO_PUBLIC_SITE_LINK,
  EMBED_SHOWCASE_PATH,
} from '@/lib/demo-entry-links';
import {
  ArrowRight,
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  ExternalLink,
  EyeOff,
  FileCheck,
  Gauge,
  Github,
  Globe2,
  Handshake,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  Plug,
  ShieldCheck,
  Sparkles,
  UserMinus,
  UserPlus,
  UserRound,
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

const REVIEWER_FEATURES = [
  {
    icon: <ClipboardCheck size={20} aria-hidden="true" />,
    title: 'Open one queue, not an inbox',
    body: 'See the proposals assigned to you in the open round, what you have already scored, and what is still waiting.',
  },
  {
    icon: <Gauge size={20} aria-hidden="true" />,
    title: 'Score the criteria the organizer set',
    body: 'Rate each weighted criterion, answer the written prompts, and watch your average update before you submit.',
  },
  {
    icon: <EyeOff size={20} aria-hidden="true" />,
    title: 'Judge without the anchoring',
    body: 'Peer scores stay hidden until the round closes, and anonymized rounds keep author names off the proposal.',
  },
  {
    icon: <UserMinus size={20} aria-hidden="true" />,
    title: 'Declare a conflict in one step',
    body: 'Recuse yourself with a reason and the assignment leaves your queue and returns to the organizer.',
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
    icon: ClipboardCheck,
    role: 'Reviewer',
    title: 'Score proposals, not spreadsheets.',
    body: 'Work an assigned queue, rate the round’s criteria, and stay blind to peer scores until it closes.',
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
 * The seeded demo entry points (`lib/demo-entry-links.ts`), surfaced above the fold so a first-time
 * visitor reaches a populated view of the role they care about without reading the page first. The
 * same entry points also close the page and sit in the global footer.
 *
 * The published event site rides along as a fourth card. It is what the other three produce, and it
 * is the only one a visitor can open without becoming somebody: no sign-in, so it is the cheapest
 * look at a finished conference. It comes last because it reads as the result of the work above it.
 *
 * `label` leads with a verb rather than the role noun on purpose, and the role noun opens `blurb`
 * instead. Automated walkthroughs pick a click target by matching label text from the start and
 * treat two matches as an error rather than choosing between them, and the footer already ships
 * `Organizer demo`, `Reviewer demo`, `Speaker demo`, and `Attendee demo` on this same page. That
 * rules out the role nouns and their stems here -- `Organize`, `Review`, `Speak` and `Attend` are
 * each still a prefix of the matching footer label -- so `Run`, `Score`, `Give` and `Browse` keep
 * all eight entry points separable at their first word. Only the start of the link text
 * disambiguates, so naming the role inside `blurb` stays clear for a reader without reintroducing
 * the clash. Re-check the whole page before rewording any of these.
 *
 * The reviewer section and the closing call to action add two more links to the same demo identity,
 * so they open on `Try` and `Rate`, which no other label on the page or in the footer starts with.
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
  {
    href: DEMO_PUBLIC_SITE_LINK,
    icon: CalendarDays,
    label: 'Browse the programme',
    blurb: 'Attendee — the published event site. No account needed.',
  },
] as const;

/**
 * The published event site an attendee actually reads. Every one of these is the demo conference's
 * own page, not a marketing mock-up of it.
 */
const ATTENDEE_LINKS = [
  {
    href: DEMO_PUBLIC_LINKS.event,
    icon: Globe2,
    label: 'Programme home',
    blurb: 'The page an attendee lands on.',
  },
  {
    href: DEMO_PUBLIC_LINKS.agenda,
    icon: CalendarCheck,
    label: 'Day-by-day agenda',
    blurb: 'Times and rooms as a grid.',
  },
  {
    href: DEMO_PUBLIC_LINKS.sessions,
    icon: ListChecks,
    label: 'Session catalogue',
    blurb: 'Search and filter the programme.',
  },
  {
    href: DEMO_PUBLIC_LINKS.speakers,
    icon: UserRound,
    label: 'Speaker directory',
    blurb: 'Bios, headshots, and sessions.',
  },
  {
    href: DEMO_PUBLIC_LINKS.sponsors,
    icon: Handshake,
    label: 'Sponsor wall',
    blurb: 'Sponsors and exhibitors by tier.',
  },
] as const;

/** The live speaker gallery widget, framed on this page exactly as a host site would embed it. */
const GALLERY_EMBED_SRC = `/embed/${DEMO_EVENT_SLUG}/gallery`;

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
          <h2 id="products-title">One conference, four purpose-built experiences.</h2>
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

      <section className={styles.product} id="reviewers">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>
            <ClipboardCheck size={17} aria-hidden="true" />
            For reviewers
          </p>
          <h2>Give reviewers a queue they can finish.</h2>
          <p>
            Review is where a programme is decided, so Cicero gives reviewers their own workspace:
            the proposals assigned to them, the criteria the organizer set, and nothing that would
            bias the score.
          </p>
        </div>
        <div className={styles.features}>
          {REVIEWER_FEATURES.map((feature) => (
            <article className={styles.feature} key={feature.title}>
              <span className={styles.featureIcon}>{feature.icon}</span>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
        {demoAvailable ? (
          <a className={styles.textLink} href={DEMO_ENTRY_LINKS.reviewer}>
            Try the reviewer queue <ArrowRight size={16} aria-hidden="true" />
          </a>
        ) : null}
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

      <section className={styles.product} id="attendees" aria-labelledby="attendees-title">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>
            <CalendarDays size={17} aria-hidden="true" />
            For attendees
          </p>
          <h2 id="attendees-title">Give attendees the programme, not a PDF.</h2>
          <p>
            The moment a session is scheduled and published it appears on the event site and in
            every widget on your own website — no export, no re-upload, no stale copy to chase.
          </p>
        </div>

        {demoAvailable ? (
          <>
            <div className={styles.attendeeShowcase}>
              <div className={styles.attendeeFrame}>
                <div className={styles.windowBar} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                {/*
                  The real widget, not a screenshot: this is the speaker gallery a visitor would get
                  from the snippet on `/embeds`, rendering the demo conference as it stands now. A
                  plain lazy iframe rather than `embed.js` keeps it out of the critical path and
                  visible without JavaScript.
                */}
                <iframe
                  className={styles.attendeeEmbed}
                  src={GALLERY_EMBED_SRC}
                  title="Live speaker gallery from the demo conference"
                  loading="lazy"
                />
              </div>
              <ul className={styles.attendeeLinks}>
                {ATTENDEE_LINKS.map((link) => (
                  <li key={link.label}>
                    <a className={styles.attendeeLink} href={link.href}>
                      <span className={styles.featureIcon}>
                        <link.icon size={20} aria-hidden="true" />
                      </span>
                      <span className={styles.attendeeLinkLabel}>
                        {link.label}
                        <ArrowRight size={15} aria-hidden="true" />
                      </span>
                      <span className={styles.attendeeLinkBlurb}>{link.blurb}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <a className={styles.textLink} href={EMBED_SHOWCASE_PATH}>
              See every embed running live <ArrowRight size={16} aria-hidden="true" />
            </a>
          </>
        ) : (
          <a className={styles.textLink} href={EMBED_SHOWCASE_PATH}>
            See what the embeds publish <ArrowRight size={16} aria-hidden="true" />
          </a>
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
              <dd>
                <a className={styles.aboutFactLink} href={EMBED_SHOWCASE_PATH}>
                  Live embeddable views
                </a>
              </dd>
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
              Paste into your agent
            </span>
            <div className={styles.agentPromptActions}>
              <div className={styles.agentProviders} aria-label="Supported AI agents">
                <Image src="/brand/agents/openai.svg" alt="OpenAI" width={34} height={34} />
                <Image src="/brand/agents/claude.svg" alt="Anthropic Claude" width={34} height={34} />
                <Image
                  src="/brand/agents/google-antigravity.svg"
                  alt="Google Antigravity"
                  width={34}
                  height={34}
                />
                <span className={styles.agentProvidersMore}>+ more</span>
              </div>
              <CopyAgentPromptButton prompt={AGENT_STARTER_PROMPT} />
            </div>
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
          <p className={styles.eyebrow}>See every side</p>
          <h2>Explore a conference already in motion.</h2>
          <p>
            See how organizers move the event forward, how reviewers decide the programme, how
            speakers get ready, and what attendees read when it is all published.
          </p>
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
              href={DEMO_ENTRY_LINKS.reviewer}
              size="lg"
              iconRight={<ArrowRight size={17} aria-hidden="true" />}
            >
              Rate proposals as a reviewer
            </Button>
            <Button
              href={DEMO_ENTRY_LINKS.speaker}
              size="lg"
              iconRight={<ArrowRight size={17} aria-hidden="true" />}
            >
              Prepare a talk as a speaker
            </Button>
            <Button
              href={DEMO_PUBLIC_SITE_LINK}
              size="lg"
              iconRight={<ArrowRight size={17} aria-hidden="true" />}
            >
              Tour the published event
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
