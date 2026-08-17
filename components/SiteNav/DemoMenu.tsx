'use client';

import { DEMO_ENTRY_LINKS } from '@/lib/demo-entry-links';
import {
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  Globe2,
  LayoutDashboard,
  Megaphone,
} from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import styles from './DemoMenu.module.css';

/**
 * Every seeded demo, signed-in and public, behind the one navigation entry that used to open the
 * public event page alone. The three role links reuse `DEMO_ENTRY_LINKS`, so they sign the visitor
 * in as the seeded identity for that role rather than dropping them on a login form.
 *
 * `label` has to stay separable from the demo links elsewhere on the page and in the global footer:
 * automated walkthroughs match a click target by the start of its text and treat two matches as an
 * error. The footer ships `Organizer demo`, `Reviewer demo`, and `Speaker demo`, and the role cards
 * in the page body ship `Run the conference`, `Score the proposals`, `Give a talk`, and `Browse the
 * programme`, so no label here may be a prefix of one of those or of another label in this list.
 * Check all three files before rewording any of them.
 */
const DEMO_DESTINATIONS = [
  {
    href: DEMO_ENTRY_LINKS.organizer,
    icon: LayoutDashboard,
    label: 'Organizer dashboard',
    blurb: 'Programme, schedule, and outstanding tasks',
  },
  {
    href: DEMO_ENTRY_LINKS.reviewer,
    icon: ClipboardCheck,
    label: 'Reviewer queue',
    blurb: 'Assigned proposals and blind scoring',
  },
  {
    href: DEMO_ENTRY_LINKS.speaker,
    icon: Megaphone,
    label: 'Speaker portal',
    blurb: 'Sessions, profile, and deliverables',
  },
  {
    href: '/demo',
    icon: Globe2,
    label: 'Public event page',
    blurb: 'What attendees see, no account needed',
  },
  {
    href: '/demo/agenda',
    icon: CalendarDays,
    label: 'Public agenda',
    blurb: 'The live programme by time and room',
  },
] as const;

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
