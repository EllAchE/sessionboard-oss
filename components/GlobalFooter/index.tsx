import Link from 'next/link';
import { Columns3, ExternalLink, Gift, Github, Globe2, Linkedin, Twitter } from 'lucide-react';
import styles from './GlobalFooter.module.css';

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

const SOURCE_URL = 'https://github.com/EllAchE/sessionboard-oss';
const MERCH_URL =
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ&start_radio=1';

export function GlobalFooter() {
  return (
    <footer className={styles.footer} aria-label="Cicero footer">
      <div className={styles.inner}>
        <div className={styles.identity}>
          <Link className={styles.brand} href="/" aria-label="Cicero home">
            <span className={styles.brandMark} aria-hidden="true">
              <Columns3 size={16} />
            </span>
            <span>Cicero</span>
          </Link>
          <p>Open-source conference operations, from call for speakers to show day.</p>
        </div>

        <nav className={styles.links} aria-label="Cicero and creator links">
          {SOCIAL_LINKS.map(({ href, icon: Icon, label }) => (
            <a key={label} className={styles.link} href={href} target="_blank" rel="noreferrer">
              <Icon size={15} aria-hidden="true" />
              <span>{label}</span>
            </a>
          ))}
          <span className={styles.divider} aria-hidden="true" />
          <a className={styles.link} href={SOURCE_URL} target="_blank" rel="noreferrer">
            <ExternalLink size={15} aria-hidden="true" />
            <span>Original repo</span>
          </a>
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
