import Link from 'next/link';
import {
  Gift,
  Github,
  Globe2,
  Landmark,
  Linkedin,
  Megaphone,
  Scale,
  Twitter,
} from 'lucide-react';
import { CiceroMark } from '@/components/CiceroBrand';
import { demoEntryPointsAreAvailable } from '@/lib/demo-availability';
import { DEMO_ENTRY_LINKS } from '@/lib/demo-entry-links';
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
] as const;

const SOCIAL_LINKS = [
  {
    href: 'https://www.elehche.com/',
    label: 'Website',
    icon: Globe2,
  },
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
          <p>Open-source conference operations, from call for speakers to show day.</p>
        </div>

        <nav
          className={styles.links}
          aria-label={
            demoAvailable
              ? 'Cicero demo and creator links'
              : 'Cicero creator links'
          }
        >
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
          {SOCIAL_LINKS.map(({ href, icon: Icon, label }) => (
            <a key={label} className={styles.link} href={href} target="_blank" rel="noreferrer">
              <Icon size={15} aria-hidden="true" />
              <span>{label}</span>
            </a>
          ))}
          <span className={styles.divider} aria-hidden="true" />
          <a className={styles.merch} href={MERCH_URL} target="_blank" rel="noreferrer">
            <Gift size={15} aria-hidden="true" />
            <span>Free merch</span>
          </a>
        </nav>
      </div>
      <div className={styles.legal}>© 2026 Cicero · MIT licensed</div>
    </footer>
  );
}
