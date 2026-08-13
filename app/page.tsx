import Image from 'next/image';
import {
  ArrowRight,
  CalendarCheck,
  FileCheck,
  Github,
  ListChecks,
  UserPlus,
} from 'lucide-react';
import { CiceroBrand } from '@/components/CiceroBrand';
import { Button } from '@/components/ui';
import dashboardImage from '@/docs/images/dashboard.jpg';
import publicAgendaImage from '@/docs/images/public-agenda.jpg';
import styles from './home.module.css';

const FEATURES = [
  {
    icon: <FileCheck size={20} aria-hidden="true" />,
    title: 'Receive petitions. Reach a verdict.',
    body: 'Proclaim your call for orators, send each proposal before the right council, and record every decision without excavating a spreadsheet ruin.',
  },
  {
    icon: <CalendarCheck size={20} aria-hidden="true" />,
    title: 'Set the imperial calendar',
    body: 'Marshal orations across chambers and themes while Cicero exposes every clash before the gates open.',
  },
  {
    icon: <ListChecks size={20} aria-hidden="true" />,
    title: 'Ready every orator for the Forum',
    body: 'Survey missing biographies, portraits, scrolls, and approvals at a glance, then send a dispatch from the same command post.',
  },
];

export default function Home() {
  return (
    <main className={styles.root}>
      <nav className={styles.nav} aria-label="Primary navigation">
        <a className={styles.brand} href="/" aria-label="Cicero home">
          <CiceroBrand markSize={34} />
        </a>
        <div className={styles.navLinks}>
          <a className={styles.aboutLink} href="#about">
            About the Forum
          </a>
          <a className={styles.demoLink} href="/demo">
            Tour the empire
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
            Enter
          </a>
          <Button
            className={styles.navCta}
            href="/signup"
            variant="primary"
            size="sm"
          >
            Join Cicero
          </Button>
        </div>
      </nav>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>From first proclamation to final ovation</p>
          <h1>Convene the crowd. Command the programme.</h1>
          <p className={styles.heroLead}>
            Cicero gathers petitions, councils, fasti, orator duties, and dispatches in one
            Forum, so organizers can govern the programme instead of chasing it.
          </p>
          <div className={styles.actions}>
            <Button
              href="/signup"
              variant="primary"
              size="lg"
              iconRight={<UserPlus size={17} aria-hidden="true" />}
            >
              Convene your event
            </Button>
            <Button
              href="/signin?email=organizer@example.com&next=/admin"
              size="lg"
              iconRight={<ArrowRight size={17} aria-hidden="true" />}
            >
              Enter the organizer Forum
            </Button>
          </div>
        </div>

        <div className={styles.heroVisual} aria-label="Cicero organizer Forum preview">
          <div className={styles.windowBar} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <Image
            className={styles.heroImage}
            src={dashboardImage}
            alt="Cicero organizer Forum showing imperial progress and next duties"
            priority
            sizes="(max-width: 760px) 94vw, (max-width: 1100px) 88vw, 1080px"
          />
          <div className={`${styles.callout} ${styles.calloutTasks}`}>
            <ListChecks size={17} aria-hidden="true" />
            <span>Every outstanding duty, on one tablet</span>
          </div>
          <div className={`${styles.callout} ${styles.calloutSchedule}`}>
            <CalendarCheck size={17} aria-hidden="true" />
            <span>Every clash exposed before the gates open</span>
          </div>
        </div>
      </section>

      <div className={styles.mosaicRule} aria-hidden="true" />

      <section className={styles.about} id="about" aria-labelledby="about-title">
        <div className={styles.aboutHeading}>
          <p className={styles.eyebrow}>The charter of Cicero</p>
          <h2 id="about-title">Built for the magistrates who make assemblies happen.</h2>
        </div>
        <div className={styles.aboutBody}>
          <p>
            Cicero is an open-source Forum for the work between a proclamation for orators and the
            day the gates open. It unites petitions, councils, fasti, orator duties, dispatches, and
            the public programme without making the organizer govern a tangle of systems.
          </p>
          <p>
            Magistrates retain command: raise it on your own infrastructure, adapt the customs, and
            proclaim fasti that any citizen may read without presenting a seal.
          </p>
          <dl className={styles.aboutFacts}>
            <div>
              <dt>License</dt>
              <dd>MIT, open source</dd>
            </div>
            <div>
              <dt>Province</dt>
              <dd>Your infrastructure</dd>
            </div>
            <div>
              <dt>Public Forum</dt>
              <dd>No seal required</dd>
            </div>
          </dl>
          <div className={styles.aboutLinks}>
            <a className={styles.textLink} href="#product">
              Enter the Forum <ArrowRight size={16} aria-hidden="true" />
            </a>
            <a
              className={styles.textLink}
              href="https://github.com/EllAchE/sessionboard-oss"
            >
              Read the source scrolls <Github size={16} aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>

      <section className={styles.product} id="product">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>One commanding Forum</p>
          <h2>All roads lead from proposal to stage.</h2>
          <p>
            The whole programme travels together, from the first petition to the final public
            calendar.
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
            alt="A public Cicero fasti laid out by hour and chamber"
            sizes="(max-width: 820px) 94vw, 58vw"
          />
        </div>
        <div className={styles.programmeCopy}>
          <p className={styles.eyebrow}>Published from the Forum</p>
          <h2>A public programme worthy of the city.</h2>
          <p>
            Proclaim clear fasti, a roll of orations, and a gallery of orators without copying a
            single record or awaiting another courier.
          </p>
          <a className={styles.textLink} href="/demo/agenda">
            Consult the demo programme <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
      </section>

      <section className={styles.finalCta}>
        <p className={styles.eyebrow}>Take command</p>
        <h2>Enter a conference already in motion.</h2>
        <p>
          The live province is filled with petitions, orators, unfinished duties, and a two-day
          programme ready for inspection.
        </p>
        <Button
          href="/signin?email=organizer@example.com&next=/admin"
          variant="primary"
          size="lg"
          iconRight={<ArrowRight size={17} aria-hidden="true" />}
        >
          Open the organizer Forum
        </Button>
      </section>

    </main>
  );
}
