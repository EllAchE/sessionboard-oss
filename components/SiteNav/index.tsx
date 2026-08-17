import Link from 'next/link';
import { CiceroBrand } from '@/components/CiceroBrand';
import { Button } from '@/components/ui';
import { DemoMenu } from './DemoMenu';
import styles from './SiteNav.module.css';

/**
 * The top bar every Cicero-owned public page wears.
 *
 * It exists because there wasn't one. `/` and `/embeds` each hand-rolled their own bar, and the
 * `/embeds` copy was taken from the `/` copy without the auth cluster — so the page that showcases
 * the product offered a visitor who already had an account no way to sign in. `/docs/api` had no
 * bar at all, only a lone chevron back to the home page.
 *
 * Splitting the bar in two is the fix. This component owns the brand and *both* auth links
 * unconditionally; callers choose only the contextual links in the middle, which legitimately
 * differ per page. A new page can forget to pass a link. It cannot render half an auth cluster.
 *
 * Pages Cicero does not own keep their own chrome and are deliberately not callers: `/embed/*`
 * renders inside a stranger's website (`lib/site-chrome.ts` records the bug that caused), `/[slug]`
 * is branded as the customer's event, and `/s/[token]` is a read-only preview for someone who has
 * no account to sign into.
 */

export type SiteNavLink = {
  href: string;
  label: string;
};

export function SiteNav({
  links,
  demoAvailable,
}: {
  links: SiteNavLink[];
  /** From `demoEntryPointsAreAvailable()`, as `GlobalFooter` takes for its own demo column. */
  demoAvailable: boolean;
}) {
  return (
    <nav className={styles.nav} aria-label="Primary navigation">
      <Link className={styles.brand} href="/" aria-label="Cicero home">
        <CiceroBrand markSize={34} />
      </Link>
      {/*
        Demo sits last because it is the only entry that leaves the marketing page for a live
        product surface, and because it opens a menu rather than jumping to a section -- a
        trigger that expands in place reads as the end of the row, not a step in it.
      */}
      <div className={styles.navLinks}>
        {links.map((link) => (
          <Link className={styles.navLink} href={link.href} key={link.href}>
            {link.label}
          </Link>
        ))}
        {demoAvailable ? <DemoMenu className={styles.demoLink} /> : null}
      </div>
      <div className={styles.navAuth}>
        <Button href="/signin" variant="secondary" size="sm">
          Sign in
        </Button>
        {/*
          The primary call to action names what the visitor gets, not the paperwork in front of it.
          "Sign up" described the form; `/signup` sends an organizer on to `/events/new` as soon as
          the link is followed, and the hero and `/embeds` already asked for an event by name.
        */}
        <Button className={styles.navCta} href="/signup" variant="primary" size="sm">
          Create event
        </Button>
      </div>
    </nav>
  );
}
