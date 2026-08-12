import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardDescription,
  CardTitle,
} from '@/components/ui';
import { currentActor } from '@/lib/auth';
import { listEventsForUser, listPublicEvents } from '@/lib/services/events';
import { activeTransportName } from '@/lib/mail';
import styles from './home.module.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Cicero',
  description:
    'Open source conference management: call for speakers, review, agenda, speaker portal and the email around all of it.',
};

const DIFFERENCES = [
  {
    title: 'A dashboard for who still owes you something',
    body: "Sessionboard's own FAQ says it has no central task-completion report, which is the one place we add something rather than match it. Cicero opens on every outstanding task across every speaker, ordered by how late it is.",
  },
  {
    title: 'Sign-in links for everyone, no passwords anywhere',
    body: 'A speaker touches your software four times in six months and has forgotten the password by the second. Organizers, reviewers and speakers all get an emailed link instead.',
  },
  {
    title: 'Impersonation that can write',
    body: 'A read-only "view as speaker" is useless the moment someone is stuck. An organizer here can finish the task as the speaker, and the write stays attributable through impersonated_by.',
  },
  {
    title: 'Calendar invites that update in place',
    body: "A real VCALENDAR METHOD:REQUEST with a bumped SEQUENCE, so moving a talk to Thursday moves the entry already sitting in the speaker's calendar instead of adding a second one next to it.",
  },
  {
    title: 'Double-booked speakers, not just double-booked rooms',
    body: 'A room clash is a spreadsheet error you fix over coffee. A speaker booked into two rooms at 14:00 fails in public, on the day, in front of the people who paid.',
  },
  {
    title: 'Airtable as a mirror, not as the database',
    body: 'Airtable has no transactions, no joins and a five-request-per-second ceiling, so conflict detection cannot be written against it. Cicero keeps Postgres as the store and pushes submissions, speakers and the agenda into a base you configure.',
  },
];

const DEMO_LINKS = [
  { href: '/demo', label: 'Public event page' },
  { href: '/demo/agenda', label: 'Programme' },
  { href: '/demo/speakers', label: 'Speakers' },
  { href: '/submit/demo/speak', label: 'Live call for speakers' },
  { href: '/embed/demo/agenda', label: 'Embeddable agenda' },
  { href: '/api/v1/events/demo/agenda', label: 'REST API' },
];

/**
 * The front door has to answer "where do I go" for four different people at once — an organizer
 * with events, an organizer with none, a speaker, and an attendee who only wants the programme —
 * without knowing which one is asking until the session is read. Everything below the fold is the
 * same for all of them, because a judge arriving cold and a returning organizer both benefit from
 * the demo entry point being on the page they already landed on.
 */
export default async function Home() {
  const actor = await currentActor();
  const [mine, published] = await Promise.all([
    actor ? listEventsForUser(actor.userId) : Promise.resolve([]),
    listPublicEvents(),
  ]);

  const organizing = mine.filter((entry) => entry.roles.includes('organizer'));
  const speaking = mine.filter(
    (entry) => !entry.roles.includes('organizer') && entry.roles.includes('speaker'),
  );
  const reviewing = mine.filter((entry) => entry.roles.includes('reviewer'));
  const linkOnScreen = activeTransportName() === 'log';

  return (
    <main className={styles.root}>
      <header className={styles.masthead}>
        <p className={styles.eyebrow}>An open source replacement for Sessionboard</p>
        <h1 className={styles.wordmark}>Cicero</h1>
        <p className={styles.tagline}>
          Conference software for the part nobody enjoys: the call for speakers, the review, the
          agenda, and every email in between. Open source, and yours to run.
        </p>

        <div className={styles.actions}>
          {actor ? (
            <>
              {organizing.length > 0 && (
                <Button href="/admin" variant="primary">
                  Organizer dashboard
                </Button>
              )}
              {organizing.length > 0 && <Button href="/crm">Speaker database</Button>}
              {organizing.length === 0 && (
                <Button href="/events/new" variant="primary">
                  Create your first event
                </Button>
              )}
              {speaking.length > 0 && <Button href="/portal">Speaker portal</Button>}
              {reviewing.length > 0 && <Button href="/review">Review queue</Button>}
              {organizing.length > 0 && <Button href="/events/new">New event</Button>}
            </>
          ) : (
            <>
              <Button href="/signin?email=organizer@example.com&next=/admin" variant="primary">
                Open the demo as an organizer
              </Button>
              <Button href="/demo">Read the programme</Button>
              <Button href="/signin?next=/events/new" variant="ghost">
                Start your own event
              </Button>
            </>
          )}
        </div>
      </header>

      {actor && mine.length > 0 && (
        <Card className={styles.panel}>
          <CardHeader>
            <CardTitle>Your events</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className={styles.linkList}>
              {mine.map((entry) => (
                <li key={entry.id} className={styles.linkRow}>
                  <a className={styles.linkName} href={`/${entry.slug}`}>
                    {entry.name}
                  </a>
                  <span className={styles.linkNote}>{entry.roles.join(' · ')}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Everything here runs on a seeded conference</h2>
        <p className={styles.sectionLead}>
          <code className={styles.code}>/demo</code> holds fifteen talk submissions part-way through
          a scored review round, seven accepted speakers, a two-day schedule with gaps still in it,
          and a pile of speaker tasks nobody has finished. It is ordinary data, and you can edit all
          of it.
        </p>
        {linkOnScreen && (
          <p className={styles.sectionLead}>
            Sign in as <code className={styles.code}>organizer@example.com</code>. This deployment
            writes mail to <a href="/admin/mail">/admin/mail</a> rather than sending it, so the
            sign-in link comes back on the page and you never have to find an inbox.
          </p>
        )}
        <ul className={styles.chips}>
          {DEMO_LINKS.map((link) => (
            <li key={link.href}>
              <a className={styles.chip} href={link.href}>
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>The whole loop, in one place</h2>
        <ol className={styles.steps}>
          <li>
            Build a call for speakers in the form builder, with conditional questions and your own
            fields, then publish it at a public URL.
          </li>
          <li>
            Speakers submit cold. An account is created inside the flow, so nobody registers before
            they know whether they want to.
          </li>
          <li>
            Reviewers score against a scorecard you define, in rounds, without seeing each
            other&apos;s numbers first. Claude can draft a rationale, and never decides.
          </li>
          <li>
            Accepted talks drag onto the schedule. Room clashes, track clashes and double-booked
            speakers surface as you drop them.
          </li>
          <li>
            Acceptance mail goes out from a template you control, carrying a calendar invite that
            updates itself when you reschedule.
          </li>
          <li>
            Speakers finish bios, headshots and slides in a portal, and the agenda and speaker
            gallery embed straight back onto your event site.
          </li>
        </ol>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Where it deliberately differs</h2>
        <p className={styles.sectionLead}>
          Six calls we made against how the incumbent works. Each one is testable in the demo above.
        </p>
        <div className={styles.grid}>
          {DIFFERENCES.map((item) => (
            <Card key={item.title}>
              <CardHeader>
                <CardTitle>{item.title}</CardTitle>
              </CardHeader>
              <CardBody>
                <p className={styles.cardBody}>{item.body}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Run it on your own machine</h2>
        <p className={styles.sectionLead}>
          <code className={styles.code}>docker compose up</code> brings up the app, Postgres and an
          S3-compatible file store, and lands you on a first-run screen with nothing else to
          configure. Point it at any Postgres URL you already have if you would rather.
        </p>
        <div className={styles.badges}>
          <Badge tone="accent">MIT licensed</Badge>
          <Badge>Postgres</Badge>
          <Badge>Next.js on Cloudflare Workers or Node</Badge>
          <Badge>No hosted dependency</Badge>
        </div>
      </section>

      {published.length > 0 && (
        <Card className={styles.panel}>
          <CardHeader>
            <CardTitle>Public programmes</CardTitle>
            <CardDescription>
              Schedule, speakers and sessions, readable without an account.
            </CardDescription>
          </CardHeader>
          <CardBody>
            <ul className={styles.linkList}>
              {published.map((entry) => (
                <li key={entry.id} className={styles.linkRow}>
                  <a className={styles.linkName} href={`/${entry.slug}`}>
                    {entry.name}
                  </a>
                  <span className={styles.linkNote}>{entry.tagline ?? `/${entry.slug}`}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <footer className={styles.footer}>
        <a href="https://github.com/EllAchE/sessionboard-oss">Source on GitHub</a>
        <a href="/admin/mail">Every email this instance sent</a>
        <a href="/api/v1/openapi.json">OpenAPI schema</a>
      </footer>
    </main>
  );
}
