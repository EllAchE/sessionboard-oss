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
import { useEffect, useId, useRef, useState } from 'react';
import styles from './DemoMenu.module.css';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div className={className ? `${styles.menu} ${className}` : styles.menu} ref={containerRef}>
      <button
        className={styles.trigger}
        type="button"
        aria-controls={panelId}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
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
