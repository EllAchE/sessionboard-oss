import { CiceroMark } from '@/components/CiceroBrand';
import { demoEntryPointsAreAvailable } from '@/lib/demo-availability';
import { DEMO_TOURS } from '@/lib/demo-entry-links';
import {
  Bot,
  CalendarDays,
  Code2,
  FileCheck,
  Gift,
  GitBranch,
  Github,
  Landmark,
  Linkedin,
  Megaphone,
  Scale,
  Twitter
} from 'lucide-react';
import Link from 'next/link';
import styles from './GlobalFooter.module.css';

const DEMO_ICONS = {
  organizer: Landmark,
  reviewer: Scale,
  speaker: Megaphone,
  event: CalendarDays,
  embeds: Code2,
} as const;

/**
 * The same five destinations the `Demos` menu in the navigation offers, under the same five names,
 * because both read `DEMO_TOURS`. The published event comes after the three role tours because it
 * is what they produce rather than a fourth workspace, and it opens the public site anyone can read
 * without an account rather than a signed-in workspace.
 *
 * These four are the ones an unseeded instance has nothing behind, so they are the ones the render
 * gates on `demoAvailable`.
 */
const DEMO_LINKS = DEMO_TOURS.filter((tour) => tour.key !== 'embeds').map((tour) => ({
  href: tour.href,
  label: tour.label,
  icon: DEMO_ICONS[tour.key],
}));

/**
 * The showcase closes the demo row rather than opening the resource row: `/embeds` is the same
 * seeded conference the four tours above it open, rendered through the widgets, so it belongs with
 * the things a visitor can go and look at rather than with the things they can go and build on.
 * It stays out of `DEMO_LINKS` because it is not gated: the showcase page renders its own empty
 * state, so it is reachable on an instance that was never seeded.
 */
const SHOWCASE_TOUR = DEMO_TOURS.find((tour) => tour.key === 'embeds')!;

const SHOWCASE_LINK = {
  href: SHOWCASE_TOUR.href,
  label: SHOWCASE_TOUR.label,
  icon: DEMO_ICONS.embeds,
} as const;

const RESOURCE_LINKS = [
  {
    href: '/#agent-quick-start',
    label: 'Agents',
    icon: Bot,
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
  /**
   * The repository, which the landing page used to reach through a `View source on GitHub` link in
   * its `Open source and self-hostable` section. That section is gone, and the `GitHub` entry in the
   * social row below points at the author's profile alongside LinkedIn and X rather than at the
   * source, so without this the claim in the blurb directly above has nothing behind it.
   */
  {
    href: 'https://github.com/EllAchE/sessionboard-oss',
    label: 'Source',
    icon: GitBranch,
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
          {/* Row one is what there is to look at: every seeded tour, then the embed samples. */}
          <div className={styles.row}>
            {demoAvailable
              ? DEMO_LINKS.map(({ href, icon: Icon, label }) => (
                  <Link key={label} className={styles.link} href={href}>
                    <Icon size={15} aria-hidden="true" />
                    <span>{label}</span>
                  </Link>
                ))
              : null}
            <Link className={styles.link} href={SHOWCASE_LINK.href}>
              <SHOWCASE_LINK.icon size={15} aria-hidden="true" />
              <span>{SHOWCASE_LINK.label}</span>
            </Link>
          </div>

          {/*
            Row two is what to build on and who built it. Agent setup and the API reference moved
            down here from the demo row: neither is something to go and look at, and the two of them
            plus the tours plus the showcase made the first line long enough to wrap on its own.
          */}
          <div className={styles.row}>
            {RESOURCE_LINKS.map(({ href, icon: Icon, label }) => (
              <Link key={label} className={styles.link} href={href}>
                <Icon size={15} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            ))}
            <span className={styles.divider} aria-hidden="true" />
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
