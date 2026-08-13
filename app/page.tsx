import Image from 'next/image';
import {
  ArrowRight,
  CalendarCheck,
  Columns3,
  FileCheck,
  Github,
  ListChecks,
  UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui';
import dashboardImage from '@/docs/images/dashboard.jpg';
import publicAgendaImage from '@/docs/images/public-agenda.jpg';
import styles from './home.module.css';

export const metadata = {
  title: 'Cicero · Conference operations, without the chaos',
  description:
    'Manage proposals, reviews, speakers, schedules, and conference communications in one calm workspace.',
};

const FEATURES = [
  {
    icon: <FileCheck size={20} aria-hidden="true" />,
    title: 'Collect and decide',
    body: 'Publish your call for speakers, route proposals to the right reviewers, and make confident decisions without spreadsheet archaeology.',
  },
  {
    icon: <CalendarCheck size={20} aria-hidden="true" />,
    title: 'Build a schedule that holds up',
    body: 'Place sessions across rooms and tracks while conflicts surface before they become show-day problems.',
  },
  {
    icon: <ListChecks size={20} aria-hidden="true" />,
    title: 'Keep every speaker moving',
    body: 'See outstanding bios, headshots, slides, and approvals at a glance, then follow up from the same place.',
  },
];

export default function Home() {
  return (
    <main className={styles.root}>
      <nav className={styles.nav} aria-label="Primary navigation">
        <a className={styles.brand} href="/" aria-label="Cicero home">
          <span className={styles.brandMark} aria-hidden="true">
            <Columns3 size={19} />
          </span>
          <span>Cicero</span>
        </a>
        <div className={styles.navLinks}>
          <a className={styles.productLink} href="#product">
            Product
          </a>
          <a className={styles.demoLink} href="/demo">
            Live demo
          </a>
          <a
            className={styles.githubLink}
            href="https://github.com/EllAchE/sessionboard-oss"
            aria-label="Cicero on GitHub"
          >
            <Github size={17} aria-hidden="true" />
            <span>GitHub</span>
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
          <p className={styles.eyebrow}>From call for speakers to show day</p>
          <h1>Conference operations that stay out of the way.</h1>
          <p className={styles.heroLead}>
            Cicero brings proposals, reviews, schedules, speaker tasks, and communications into one
            calm workspace, so organizers can focus on the programme.
          </p>
          <div className={styles.actions}>
            <Button
              href="/signup"
              variant="primary"
              size="lg"
              iconRight={<UserPlus size={17} aria-hidden="true" />}
            >
              Create your event
            </Button>
            <Button
              href="/signin?email=organizer@example.com&next=/admin"
              size="lg"
              iconRight={<ArrowRight size={17} aria-hidden="true" />}
            >
              Try the organizer demo
            </Button>
          </div>
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
            alt="Cicero organizer dashboard showing event progress and next actions"
            priority
            sizes="(max-width: 760px) 94vw, (max-width: 1100px) 88vw, 1080px"
          />
          <div className={`${styles.callout} ${styles.calloutTasks}`}>
            <ListChecks size={17} aria-hidden="true" />
            <span>Every outstanding task, in one view</span>
          </div>
          <div className={`${styles.callout} ${styles.calloutSchedule}`}>
            <CalendarCheck size={17} aria-hidden="true" />
            <span>Conflicts surfaced before show day</span>
          </div>
        </div>
      </section>

      <div className={styles.mosaicRule} aria-hidden="true" />

      <section className={styles.product} id="product">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>One calm workspace</p>
          <h2>Move every speaker from proposal to stage.</h2>
          <p>
            The full programme stays connected, from the first submission through the final public
            schedule.
          </p>
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
            alt="A public Cicero conference agenda laid out by time and room"
            sizes="(max-width: 820px) 94vw, 58vw"
          />
        </div>
        <div className={styles.programmeCopy}>
          <p className={styles.eyebrow}>Ready for the audience</p>
          <h2>A public programme people can actually use.</h2>
          <p>
            Publish a clear agenda, session list, and speaker gallery without duplicating work or
            waiting on another handoff.
          </p>
          <a className={styles.textLink} href="/demo/agenda">
            Browse the demo programme <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
      </section>

      <section className={styles.finalCta}>
        <p className={styles.eyebrow}>See the whole workflow</p>
        <h2>Start with a conference already in motion.</h2>
        <p>
          The live demo is filled with proposals, speakers, pending tasks, and a two-day programme
          you can explore.
        </p>
        <Button
          href="/signin?email=organizer@example.com&next=/admin"
          variant="primary"
          size="lg"
          iconRight={<ArrowRight size={17} aria-hidden="true" />}
        >
          Open the organizer demo
        </Button>
      </section>

      <footer className={styles.footer}>
        <span>© 2026 Cicero</span>
        <a href="https://github.com/EllAchE/sessionboard-oss" aria-label="Cicero on GitHub">
          <Github size={17} aria-hidden="true" />
          <span>GitHub</span>
        </a>
      </footer>
    </main>
  );
}
