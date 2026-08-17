'use client';

import { DEMO_TOURS } from '@/lib/demo-entry-links';
import {
  ChevronDown,
  ClipboardCheck,
  Code2,
  Globe2,
  LayoutDashboard,
  Megaphone,
} from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import styles from './DemoMenu.module.css';

/**
 * Set the first time this menu introduces itself, so it opens on its own exactly once per browser
 * and stays a plain menu on every visit after that, including a back navigation.
 */
const INTRODUCED_KEY = 'cicero-demos-introduced';

/**
 * Every seeded demo, signed-in and public, behind the one navigation entry that used to open the
 * public event page alone. Destinations and labels come from `DEMO_TOURS`, so this menu and the
 * first row of the global footer offer the same five places under the same five names. They used to
 * disagree on both: this menu said `Organizer dashboard` where the footer said `Organizer demo`, and
 * its fifth entry was `Public agenda` -- one page of the published event listed directly above it --
 * rather than the embed showcase.
 *
 * The three role links resolve to `DEMO_ENTRY_LINKS`, so they sign the visitor in as the seeded
 * identity for that role rather than dropping them on a login form.
 *
 * A label here is now deliberately the same string as its counterpart in the footer, so an
 * automated walkthrough can no longer pick a click target by matching link text across the whole
 * page -- it has to scope the match to this menu or to the footer first. Within either surface the
 * five stay distinct, and none is a prefix of the role cards in the page body (`Run the
 * conference`, `Score the proposals`, `Give a talk`, `Browse the programme`).
 */
const DEMO_BLURBS: Record<(typeof DEMO_TOURS)[number]['key'], string> = {
  organizer: 'Programme, schedule, and outstanding tasks',
  reviewer: 'Assigned proposals and blind scoring',
  speaker: 'Sessions, profile, and deliverables',
  event: 'What attendees see, no account needed',
  embeds: 'Every embeddable view, with its snippet',
};

const DEMO_ICONS: Record<(typeof DEMO_TOURS)[number]['key'], typeof LayoutDashboard> = {
  organizer: LayoutDashboard,
  reviewer: ClipboardCheck,
  speaker: Megaphone,
  event: Globe2,
  embeds: Code2,
};

const DEMO_DESTINATIONS = DEMO_TOURS.map(({ key, href, label }) => ({
  href,
  icon: DEMO_ICONS[key],
  label,
  blurb: DEMO_BLURBS[key],
}));

export function DemoMenu({ className }: { className?: string }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  /** True only while the panel is showing itself uninvited, which is what the note explains. */
  const [introducing, setIntroducing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setIntroducing(false);
  }, []);

  /*
   * Opens itself once, on the first page a visitor loads, so the five demos are read rather than
   * found. It runs after mount rather than from the initial state because the server has no
   * `localStorage`: the panel must render closed on the server and on the first client paint, or
   * hydration disagrees with the markup. The flag is written as it opens, so a reload or a back
   * navigation gets the ordinary closed menu.
   */
  useEffect(() => {
    try {
      if (window.localStorage.getItem(INTRODUCED_KEY)) return;
      window.localStorage.setItem(INTRODUCED_KEY, 'seen');
    } catch {
      // A browser that refuses storage cannot be told this happened, so it is never shown at all.
      return;
    }
    setOpen(true);
    setIntroducing(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) close();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      close();
      triggerRef.current?.focus();
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [close, open]);

  return (
    <div className={className ? `${styles.menu} ${className}` : styles.menu} ref={containerRef}>
      <button
        className={styles.trigger}
        type="button"
        aria-controls={panelId}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => (open ? close() : setOpen(true))}
        ref={triggerRef}
      >
        Demos
        <ChevronDown
          className={open ? `${styles.chevron} ${styles.chevronOpen}` : styles.chevron}
          size={15}
          aria-hidden="true"
        />
      </button>
      {/*
        The panel stays in the markup while closed so its links ship in the server-rendered HTML,
        and `hidden` keeps them out of the tab order and the accessibility tree until it opens.
      */}
      <ul className={styles.panel} hidden={!open} id={panelId}>
        {/*
          Only while the panel opened itself: it says who opened it and what the five links below
          have in common. Once dismissed it never returns, so nothing here may carry a destination
          the rest of the menu does not.
        */}
        {introducing ? (
          <li className={styles.intro}>
            <p className={styles.introTitle}>Smol team: start here</p>
            <p className={styles.introBody}>
              Each link opens the same seeded conference as a different kind of user.
            </p>
          </li>
        ) : null}
        {DEMO_DESTINATIONS.map(({ href, icon: Icon, label, blurb }) => (
          <li key={label}>
            <a className={styles.destination} href={href}>
              <span className={styles.destinationIcon}>
                <Icon size={17} aria-hidden="true" />
              </span>
              <span className={styles.destinationLabel}>{label}</span>
              <span className={styles.destinationBlurb}>{blurb}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
