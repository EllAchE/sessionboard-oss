import { SiteNav } from '@/components/SiteNav';
import { Button } from '@/components/ui';
import dashboardImage from '@/docs/images/submission-evidence/local-seeded-organizer.png';
import { demoEntryPointsAreAvailable } from '@/lib/demo-availability';
import {
  DEMO_ENTRY_LINKS,
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
  Globe2,
  Handshake,
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

/**
 * The four experiences, and the only route into the seeded demo from the page body. Each card
 * carries the demo for its own role (`lib/demo-entry-links.ts`), so a visitor picks a tour from the
 * description of what that role does rather than from a separate list of names above the fold. The
 * attendee tour is the published event site, which needs no sign-in: it is what the other three
 * produce, and the cheapest look at a finished conference.
 *
 * `demoLabel` leads with a verb rather than the role noun on purpose. Automated walkthroughs pick a
 * click target by matching label text from the start and treat two matches as an error rather than
 * choosing between them, and the footer already ships `Organizer demo`, `Reviewer demo`, and
 * `Speaker demo` on this same page. That rules out the role nouns and their stems here --
 * `Organize`, `Review` and `Speak` are each still a prefix of the matching footer label -- so `Run`,
 * `Score`, `Give`, and `Browse` keep every entry point separable at its first word. Only the start
 * of the link text disambiguates, so the role stays legible from `role` and `body` without
 * reintroducing the clash. `DemoMenu` in the navigation holds a third copy of the same rule; check
 * it and the footer before rewording any of these.
 */
const ROLE_PRODUCTS = [
  {
    icon: LayoutDashboard,
    role: 'Organizer',
    title: 'Keep the whole conference moving.',
    body: 'Manage proposals, reviews, schedules, communications, and speaker follow-up.',
    demoHref: DEMO_ENTRY_LINKS.organizer,
    demoLabel: 'Run the conference',
  },
  {
    icon: ClipboardCheck,
    role: 'Reviewer',
    title: 'Score proposals, not spreadsheets.',
    body: 'Work an assigned queue, rate the round’s criteria, and stay blind to peer scores until it closes.',
    demoHref: DEMO_ENTRY_LINKS.reviewer,
    demoLabel: 'Score the proposals',
  },
  {
    icon: Megaphone,
    role: 'Speaker',
    title: 'Stay ready from proposal to stage.',
    body: 'Submit a talk, maintain your profile, send deliverables, and upload your slides.',
    demoHref: DEMO_ENTRY_LINKS.speaker,
    demoLabel: 'Give a talk',
  },
  {
    icon: CalendarDays,
    role: 'Attendee',
    title: 'Plan the day from the live programme.',
    body: 'Browse the agenda, discover speakers, and build a personal itinerary, no account needed.',
    demoHref: DEMO_PUBLIC_SITE_LINK,
    demoLabel: 'Browse the programme',
  },
] as const;

/**
 * The published event site an attendee actually reads. Every one of these is the demo conference's
 * own page, not a marketing mock-up of it.
 *
 * The attendee role card above links to the programme's front door; these are the pages behind it.
 * The card answers "is there something here for me", this answers "what does it actually contain".
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

export default async function Home() {
  return <HomeContent demoAvailable={await demoEntryPointsAreAvailable()} />;
}

export function HomeContent({ demoAvailable }: { demoAvailable: boolean }) {
  return (
    <main className={styles.root}>
      {/*
        Bare hashes rather than `/#products`: this is the page those sections are on. `About` used
        to lead this list and pointed at a section that restated the products section above it and
        the agent section below it; both the section and the link to it are gone.
      */}
      <SiteNav
        demoAvailable={demoAvailable}
        links={[
          { href: '#products', label: 'Product' },
          { href: '/docs/api', label: 'API' },
        ]}
      />

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Conference operations, end to end</p>
          <h1>From call for speakers to first day</h1>
          <p className={styles.heroLead}>
            Manage submissions, review, sourcing, scheduling, speaker tasks, and publishing in one place.
          </p>
          <div className={styles.agentStarter}>
            <div className={styles.agentStarterCopy}>
              <p className={styles.agentStarterLabel}>
                <Sparkles size={17} aria-hidden="true" />
                AI-guided setup
              </p>
              <p className={styles.agentStarterHint}>
                Claude or ChatGPT walks you through it, one safe step at a time.
              </p>
            </div>
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

          {/*
            The role demos used to sit here as a fourth stack of links under the two setup calls to
            action, which pushed the hero long and asked a first-time visitor to pick a role before
            the page had said what each one does. They now hang off the matching card in the
            products section, where the role is already described.
          */}
          {demoAvailable ? null : (
            <div className={styles.freshStart}>
              <p className={styles.freshStartTitle}>Fresh instance</p>
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
          {ROLE_PRODUCTS.map(({ icon: Icon, role, title, body, demoHref, demoLabel }) => (
            <article className={`${styles.feature} ${styles.roleProduct}`} key={role}>
              <span className={styles.featureIcon}>
                <Icon size={20} aria-hidden="true" />
              </span>
              <p className={styles.roleProductRole}>{role}</p>
              <h3>{title}</h3>
              <p>{body}</p>
              {demoAvailable ? (
                <a className={styles.roleProductDemo} href={demoHref}>
                  {demoLabel} <ArrowRight size={15} aria-hidden="true" />
                </a>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      {/*
        This section used to frame a live `/embed/.../gallery` iframe here, under
        `className={styles.product}` -- a class `home.module.css` never defined. With no class the
        section escaped the width constraint every neighbour carries, so it rendered full-bleed and
        pulled the page's rhythm apart around it, and a fixed-height widget frame took a screenful
        to say what the link below it says in a line. The embeds have a home that shows all of them
        against the real conference with the snippet that produces each one -- `/embeds` -- so this
        section points there instead of running one of them inline.
      */}
      <section className={styles.attendees} id="attendees" aria-labelledby="attendees-title">
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
        ) : null}

        <a className={styles.textLink} href={EMBED_SHOWCASE_PATH}>
          {demoAvailable ? 'See every embed running live' : 'See what the embeds publish'}{' '}
          <ArrowRight size={16} aria-hidden="true" />
        </a>
      </section>

      {/*
        An `Open source and self-hostable` section sat here, between the attendee section and the
        agent section below. It had already been reduced to one paragraph and two links once, and
        what was left restated its neighbours: the paragraph promised the API, the embeds, and the
        extensibility that the API navigation item, the attendee section directly above, and this
        agent section directly below each demonstrate, and its two links pointed at the agent
        section and at GitHub, which the footer carries. The `Open source and self-hostable` claim
        itself still leads the footer, next to the licence and the repository.

        Its `border-bottom` and this section's `border-block` also stacked two hairlines in the gap
        between them, and the second of this section's pair drew a rule under the last section on
        the page. No other band here separates itself with a line -- the mosaic between the hero and
        the products section is a full illustrated strip, not a rule -- so both are gone rather than
        collapsed to one.
      */}
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
          {/*
            A numbered `Copy one line / Create a key / Connect the MCP` list used to sit here and
            spent three headings restating the panel beside it: the prompt to copy, the endpoint to
            point a client at, and the key that authenticates it are all already shown there, as the
            literal strings a reader has to use rather than a description of them. Setup is one
            sentence and a link, not a section.
          */}
          <p>
            Copy the prompt, paste it into your agent, and it does the rest — hosting, your first
            event, and the API key the MCP server needs.
          </p>

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
            Streamable HTTP, authenticated with an event API key as a Bearer token. Create one under
            Organizer → Integrations: read-only or read and write, shown once, hashed at rest.
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

    </main>
  );
}
