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
import { createPortal } from 'react-dom';
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

/** Breathing room between the trigger and panel and the edge of the lit area, in pixels. */
const SPOTLIGHT_PADDING = 10;

/** The lit rectangle, in viewport coordinates, as the portalled cutout consumes it. */
type SpotlightRect = { top: number; left: number; width: number; height: number };

export function DemoMenu({ className }: { className?: string }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  /** True only while the panel is showing itself uninvited, which is what the note explains. */
  const [introducing, setIntroducing] = useState(false);
  /** Null until the introduction has something worth lighting, which is what gates the cutout. */
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);

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

  /*
   * Measures what the cutout has to leave lit: the trigger and the panel together, which no single
   * element's box covers -- the panel is absolutely positioned, so it is outside the container's own
   * border box. Recomputed on scroll and resize because the rectangle is in viewport coordinates and
   * the bar it sits in is part of the page flow.
   *
   * A zero-width trigger means the menu is display:none at this breakpoint, where the introduction
   * has nothing to point at. Darkening the page around an invisible target is the one outcome worse
   * than not introducing at all, so the cutout stays unrendered and the menu behaves as it always
   * did there.
   */
  useEffect(() => {
    if (!introducing) {
      setSpotlight(null);
      return;
    }

    const measure = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      const panel = panelRef.current?.getBoundingClientRect();
      if (!trigger || !panel || trigger.width === 0) {
        setSpotlight(null);
        return;
      }

      /*
       * The top comes from the bar rather than from the trigger when there is a bar, because a
       * rectangle that starts at the text cuts the bar in half lengthwise and the seam reads as a
       * rendering fault. Starting at the bar's own top edge makes the lit area a column through it.
       */
      const bar = triggerRef.current?.closest('nav')?.getBoundingClientRect();
      const top = Math.min(bar?.top ?? trigger.top, trigger.top, panel.top) - SPOTLIGHT_PADDING;
      const left = Math.min(trigger.left, panel.left) - SPOTLIGHT_PADDING;
      const right = Math.max(trigger.right, panel.right) + SPOTLIGHT_PADDING;
      const bottom = Math.max(trigger.bottom, panel.bottom) + SPOTLIGHT_PADDING;
      setSpotlight({ top, left, width: right - left, height: bottom - top });
    };

    measure();
    window.addEventListener('resize', measure);
    // Capture, so a scroll inside any container that moves the bar is caught as well as the page's.
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [introducing]);

  const dismissIntroduction = () => {
    close();
    triggerRef.current?.focus();
  };

  return (
    <div className={className ? `${styles.menu} ${className}` : styles.menu} ref={containerRef}>
      {/*
        The dimming is one element with a hole in it: a transparent box over the menu carrying a
        shadow wide enough to cover any viewport, so everything outside the box darkens and the menu
        keeps its own colours. It is portalled to the body because the bar's `backdrop-filter` makes
        it the containing block for fixed descendants, which would have pinned this to the bar
        instead of the viewport, and it is `pointer-events: none` so the menu underneath stays
        clickable and a click anywhere else still reaches the dismissal handler above.
      */}
      {spotlight
        ? createPortal(
            <div className={styles.spotlight} style={spotlight} aria-hidden="true" />,
            document.body,
          )
        : null}
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
      <ul
        className={introducing ? `${styles.panel} ${styles.panelLit}` : styles.panel}
        hidden={!open}
        id={panelId}
        ref={panelRef}
      >
        {/*
          Only while the panel opened itself: it says who opened it, what the five links below have
          in common, and that this is the one time it will do so -- a panel that opens on its own and
          dims the page has to account for itself or it reads as something gone wrong. Once dismissed
          it never returns, so nothing here may carry a destination the rest of the menu does not.
        */}
        {introducing ? (
          <li className={styles.intro}>
            <p className={styles.introTitle}>Smol team: start here</p>
            <p className={styles.introBody}>
              Each link opens the same seeded conference as a different kind of user.
            </p>
            <p className={styles.introFoot}>
              <span className={styles.introNote}>Shown once, on your first visit.</span>
              {/*
                The only way out that names itself. Escape and a click anywhere else close this too,
                but neither is visible, and the dimming asks for a way out that is.
              */}
              <button className={styles.introDismiss} type="button" onClick={dismissIntroduction}>
                Got it
              </button>
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
