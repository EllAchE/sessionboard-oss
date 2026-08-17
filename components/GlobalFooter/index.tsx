import { CiceroMark } from '@/components/CiceroBrand';
import { demoEntryPointsAreAvailable } from '@/lib/demo-availability';
import {
  DEMO_ENTRY_LINKS,
  DEMO_PUBLIC_SITE_LINK,
  EMBED_SHOWCASE_PATH,
} from '@/lib/demo-entry-links';
import {
  Bot,
  CalendarDays,
  Code2,
  FileCheck,
  Gift,
  Github,
  Landmark,
  Linkedin,
  Megaphone,
  Scale,
  Twitter
} from 'lucide-react';
import Link from 'next/link';
import styles from './GlobalFooter.module.css';

const DEMO_LINKS = [
  {
    href: DEMO_ENTRY_LINKS.organizer,
    label: 'Organizer demo',
    icon: Landmark,
  },
  {
    href: DEMO_ENTRY_LINKS.reviewer,
    label: 'Reviewer demo',
    icon: Scale,
  },
  {
    href: DEMO_ENTRY_LINKS.speaker,
    label: 'Speaker demo',
    icon: Megaphone,
  },
  /**
   * The published event itself, last because it is the output of the three roles above rather than
   * a fourth workspace. `Sample event` rather than `Attendee demo`: the other three open a signed-in
   * workspace, and this one opens the public site anyone can read without an account.
   */
  {
    href: DEMO_PUBLIC_SITE_LINK,
    label: 'Sample event',
    icon: CalendarDays,
  },
] as const;

const RESOURCE_LINKS = [
  {
    href: '/#agent-quick-start',
    label: 'Agents',
    icon: Bot,
  },
  {
    href: EMBED_SHOWCASE_PATH,
    label: 'Embeds',
    icon: Code2,
  },
  /**
   * The rendered reference at `/docs/api`, not the raw `openapi.json` this used to point at — a
   * spec file is a download prompt in most browsers, and "API docs" has to open something a person
   * can read. The spec is still one click away from that page.
   */
  {
    href: '/docs/api',
    label: 'API',
    icon: FileCheck,
  },
] as const;

const SOCIAL_LINKS = [
  {
    href: 'https://github.com/EllAchE',
    label: 'GitHub',
    icon: Github,
  },
  {
    href: 'https://www.linkedin.com/in/logan-harless',
    label: 'LinkedIn',
    icon: Linkedin,
  },
  {
    href: 'https://x.com/myhandleisbest',
    label: 'X',
    icon: Twitter,
  },
] as const;

const MERCH_URL =
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ&start_radio=1';

export async function GlobalFooter() {
  return <GlobalFooterContent demoAvailable={await demoEntryPointsAreAvailable()} />;
}

export function GlobalFooterContent({ demoAvailable }: { demoAvailable: boolean }) {
  return (
    <footer className={styles.footer} aria-label="Cicero footer">
      <div className={styles.inner}>
        <div className={styles.identity}>
          <Link className={styles.brand} href="/" aria-label="Cicero home">
            <CiceroMark size={28} />
            <span>Cicero</span>
          </Link>
          <p>
            Open source and self-hostable conference operations, from call for speakers to show
            day.
          </p>
        </div>

        <nav
          className={styles.links}
          aria-label={
            demoAvailable
              ? 'Cicero demo, resource, and creator links'
              : 'Cicero resource and creator links'
          }
        >
          {/* Row one is the product: the role tours, then the two ways to build on it. */}
          <div className={styles.row}>
            {demoAvailable ? (
              <>
                {DEMO_LINKS.map(({ href, icon: Icon, label }) => (
                  <Link key={label} className={styles.link} href={href}>
                    <Icon size={15} aria-hidden="true" />
                    <span>{label}</span>
                  </Link>
                ))}
                <span className={styles.divider} aria-hidden="true" />
              </>
            ) : null}
            {RESOURCE_LINKS.map(({ href, icon: Icon, label }) => (
              <Link key={label} className={styles.link} href={href}>
                <Icon size={15} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            ))}
          </div>

          {/* Row two is the people: where to find the author, with merch closing out the line. */}
          <div className={styles.row}>
            {SOCIAL_LINKS.map(({ href, icon: Icon, label }) => (
              <a key={label} className={styles.link} href={href} target="_blank" rel="noreferrer">
                <Icon size={15} aria-hidden="true" />
                <span>{label}</span>
              </a>
            ))}
            {/*
              No divider ahead of it: merch is the tail of the social row, not a group of its own.
              The rule it used to carry, plus its own left margin, gave the line two more things to
              fit and pushed the button onto a row by itself at ordinary desktop widths.
            */}
            <a className={styles.merch} href={MERCH_URL} target="_blank" rel="noreferrer">
              <Gift size={15} aria-hidden="true" />
              <span>Free merch</span>
            </a>
          </div>
        </nav>
      </div>
      <div className={styles.legal}>© 2026 Cicero</div>
    </footer>
  );
}
