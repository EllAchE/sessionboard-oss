import { CiceroBrand } from '@/components/CiceroBrand';
import { Button } from '@/components/ui';
import dashboardImage from '@/docs/images/dashboard.jpg';
import publicAgendaImage from '@/docs/images/public-agenda.jpg';
import { demoEntryPointsAreAvailable } from '@/lib/demo-availability';
import { DEMO_ENTRY_LINKS } from '@/lib/demo-entry-links';
import {
  ArrowRight,
  Bot,
  CalendarCheck,
  ClipboardCheck,
  ExternalLink,
  FileCheck,
  Github,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import Image from 'next/image';
import { CopyAgentPromptButton } from './CopyAgentPromptButton';
import styles from './home.module.css';

const AGENT_STARTER_PROMPT = `$onboard-cicero

Help me set up Cicero from this Claude or ChatGPT session.

Read and follow the bundled onboarding guide first:
https://github.com/EllAchE/sessionboard-oss/blob/main/.agents/skills/onboard-cicero/SKILL.md

Resume from this working directory if Cicero is already cloned; otherwise help me clone it. Read or establish the local onboarding state, then discover only the missing hosting, account, event, and API-key readiness facts. Walk me through one unfinished milestone at a time. If you cannot run a step yourself, give me the exact action and wait for its result. Keep every live or destructive action behind an explicit confirmation. When setup is complete, hand off to $manage-cicero-event for a preview-only reconciliation.`;

const FEATURES = [
  {
    icon: <FileCheck size={20} aria-hidden="true" />,
    title: 'Collect and review proposals',
    body: 'Publish a call for speakers, route proposals to reviewers, and record decisions.',
  },
  {
    icon: <CalendarCheck size={20} aria-hidden="true" />,
    title: 'Build a conflict-aware schedule',
    body: 'Schedule sessions across rooms and tracks, with conflicts flagged as you work.',
  },
  {
    icon: <ListChecks size={20} aria-hidden="true" />,
    title: 'Keep every speaker on track',
    body: 'See missing bios, headshots, files, and approvals, then follow up from the same workspace.',
  },
];

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
          <a className={styles.aboutLink} href="#about">
            About
          </a>
          {demoAvailable ? (
            <a className={styles.demoLink} href="/demo">
              Explore the demo
            </a>
          ) : null}
          <a className={styles.agentLink} href="#agent-quick-start">
            Agent quick start
          </a>
          <a className={styles.signInLink} href="/signin">
            Sign in
          </a>
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
          <div className={styles.actions}>
            <CopyAgentPromptButton
              prompt={AGENT_STARTER_PROMPT}
              label="Copy setup prompt"
              copiedLabel="Setup prompt copied"
              size="lg"
              variant="primary"
            />
            <Button
              href="/signup"
              size="lg"
              iconRight={<UserPlus size={17} aria-hidden="true" />}
            >
              Create an event
            </Button>
          </div>
          <p className={styles.agentActionHint}>
            Paste it into Claude or ChatGPT. Your agent will guide setup one safe step at a time.
          </p>

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
          <Image
            className={styles.heroImage}
            src={dashboardImage}
            alt="Cicero organizer dashboard showing event progress and outstanding tasks"
            priority
            sizes="(max-width: 760px) 94vw, (max-width: 1100px) 88vw, 1080px"
          />
          <div className={`${styles.callout} ${styles.calloutTasks}`}>
            <ListChecks size={17} aria-hidden="true" />
            <span>Outstanding tasks in one view</span>
          </div>
          <div className={`${styles.callout} ${styles.calloutSchedule}`}>
            <CalendarCheck size={17} aria-hidden="true" />
            <span>Conflicts flagged before publishing</span>
          </div>
        </div>
      </section>

      <div className={styles.mosaicRule} aria-hidden="true" />

      <section className={styles.about} id="about" aria-labelledby="about-title">
        <div className={styles.aboutHeading}>
          <p className={styles.eyebrow}>Open-source conference operations</p>
          <h2 id="about-title">One workspace for the people who run conferences.</h2>
        </div>
        <div className={styles.aboutBody}>
          <p>
            Cicero is an open-source system for submissions, review, scheduling, speaker tasks,
            communications, and the public programme. Self-host it and adapt it to your event.
          </p>
          <dl className={styles.aboutFacts}>
            <div>
              <dt>License</dt>
              <dd>MIT, open source</dd>
            </div>
            <div>
              <dt>Hosting</dt>
              <dd>Self-hosted</dd>
            </div>
            <div>
              <dt>Public pages</dt>
              <dd>No account required</dd>
            </div>
          </dl>
          <div className={styles.aboutLinks}>
            <a className={styles.textLink} href="#product">
              See how it works <ArrowRight size={16} aria-hidden="true" />
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

      <section className={styles.product} id="product">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>One connected workflow</p>
          <h2>Move each proposal from submission to the stage.</h2>
        </div>
        <div className={styles.features}>
          {FEATURES.map((feature) => (
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
          <p className={styles.eyebrow}>Publish from the same workspace</p>
          <h2>Keep the public programme in sync.</h2>
          <p>Publish the agenda, sessions, and speaker directory from the same data.</p>
          <a className={styles.textLink} href={demoAvailable ? '/demo/agenda' : '/signup'}>
            {demoAvailable ? 'Explore the demo programme' : 'Publish your first programme'}{' '}
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
      </section>

      <section
        className={styles.agentQuickStart}
        id="agent-quick-start"
        aria-labelledby="agent-quick-start-title"
      >
        <div className={styles.agentQuickIntro}>
          <p className={styles.eyebrow}>Agent quick start</p>
          <h2 id="agent-quick-start-title">
            Give your agent a brief. Review every change before it applies.
          </h2>
          <p>
            The bundled onboarding skill tracks setup progress and hands event changes to a
            preview-first agent.
          </p>

          <ol className={styles.agentSteps}>
            <li>
              <span className={styles.agentStepNumber}>1</span>
              <div className={styles.agentStepCopy}>
                <h3>Copy the setup prompt</h3>
                <p>Paste it into a Claude or ChatGPT session with coding tools.</p>
              </div>
            </li>
            <li>
              <span className={styles.agentStepNumber}>2</span>
              <div className={styles.agentStepCopy}>
                <h3>Let your agent find your place</h3>
                <p>
                  <code>$onboard-cicero</code> records progress in{' '}
                  <code>.cicero/onboarding.json</code> and resumes where it stopped.
                </p>
              </div>
            </li>
            <li>
              <span className={styles.agentStepNumber}>3</span>
              <div className={styles.agentStepCopy}>
                <h3>Hand off when ready</h3>
                <p>
                  Add <code>CICERO_API_KEY</code> when prompted. Event changes are previewed before
                  they are applied.
                </p>
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
              <Bot size={17} aria-hidden="true" />
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

      {demoAvailable ? (
        <section className={styles.finalCta}>
          <p className={styles.eyebrow}>Explore the demo</p>
          <h2>Enter a conference already in motion.</h2>
          <p>Explore the seeded event as an organizer, reviewer, or speaker.</p>
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
              Score proposals as a reviewer
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
              Create your event
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
