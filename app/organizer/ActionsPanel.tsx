'use client';

import { useHotkeyContext } from '@/components/hotkeys/HotkeyProvider';
import { KeyCaps } from '@/components/hotkeys/KeyCaps';
import { Button, Dialog, Kbd } from '@/components/ui';
import { ariaKeyshortcuts } from '@/lib/hotkeys/match';
import { SCOPES, getBinding } from '@/lib/hotkeys/registry';
import {
  Activity,
  CalendarPlus,
  ExternalLink,
  Gauge,
  Keyboard,
  MessageCircleMore,
  Search,
  Sparkles,
  UserRound,
  Zap,
} from 'lucide-react';
import { useId, useState } from 'react';
import styles from './quick-actions.module.css';

/**
 * The workspace's actions panel — the floating button in the corner and what it opens.
 *
 * It used to be called Health, which described the one line of status it carried rather than the
 * five things it is actually used for. What it is is a menu of the moves available from anywhere,
 * so it says so, and every row now names the key that makes the same move without opening it: the
 * panel is the discoverable form of the shortcuts, not an alternative to them.
 *
 * The rows are keyed by binding id and read their caps out of `lib/hotkeys/registry`, so a row
 * cannot advertise a key the engine does not fire. `ActionsPanel.test.tsx` holds every id in the
 * table to a binding that exists.
 */

interface ActionRow {
  /** Its binding in `SCOPES.organizerGlobal`. The caps beside the row come from this. */
  bindingId: string;
  label: string;
  detail: string;
  icon: React.ReactNode;
  /** Where the row navigates, for the rows that navigate. */
  href?: string;
  /** What the row runs instead, for the two that open something in place. */
  run?: 'command-palette' | 'shortcuts';
}

export function actionRows(currentEventSlug?: string): ActionRow[] {
  return [
    {
      bindingId: 'command-palette',
      label: 'Search and jump',
      detail: 'Find any organizer view or action',
      icon: <Search size={17} aria-hidden="true" />,
      run: 'command-palette',
    },
    {
      bindingId: 'goto-overview',
      label: 'Organizer dashboard',
      detail: 'Return to your event overview',
      icon: <Gauge size={17} aria-hidden="true" />,
      href: '/organizer',
    },
    {
      bindingId: 'goto-new-event',
      label: 'Create an event',
      detail: 'Start a new programme',
      icon: <CalendarPlus size={17} aria-hidden="true" />,
      href: '/events/new',
    },
    {
      bindingId: 'goto-portal',
      label: 'Speaker portal',
      detail: 'Open the participant experience',
      icon: <UserRound size={17} aria-hidden="true" />,
      href: '/portal',
    },
    // Only when there is an event to preview; the binding stays documented either way.
    ...(currentEventSlug
      ? [
          {
            bindingId: 'goto-public',
            label: 'Public programme',
            detail: 'Preview the attendee-facing agenda',
            icon: <ExternalLink size={17} aria-hidden="true" />,
            href: `/${currentEventSlug}`,
          },
        ]
      : []),
    {
      bindingId: 'shortcuts-help',
      label: 'See every shortcut',
      detail: 'What these keys do on this screen',
      icon: <Keyboard size={17} aria-hidden="true" />,
      run: 'shortcuts',
    },
  ];
}

/**
 * The panel's body, separate from the dialog that carries it so it can be rendered on its own —
 * `components/ui/Dialog` portals into `document.body` and draws nothing at all on the server.
 */
export function ActionsList({
  currentEventSlug,
  onOpenCommand,
  onOpenShortcuts,
}: {
  currentEventSlug?: string;
  onOpenCommand: () => void;
  onOpenShortcuts: () => void;
}) {
  const { platform } = useHotkeyContext();
  const rows = actionRows(currentEventSlug);

  return (
    <section className={styles.section} aria-labelledby="organizer-actions">
      <div className={styles.sectionHeading}>
        <Sparkles size={15} aria-hidden="true" />
        <h3 id="organizer-actions">Quick actions</h3>
      </div>
      <nav className={styles.list} aria-label="Quick actions">
        {rows.map((row) => {
          const binding = getBinding(SCOPES.organizerGlobal, row.bindingId);
          const caps = binding ? (
            <KeyCaps className={styles.keys} binding={binding} platform={platform} decorative />
          ) : null;
          const body = (
            <>
              <span className={styles.rowIcon}>{row.icon}</span>
              <span className={styles.rowCopy}>
                <strong>{row.label}</strong>
                <span>{row.detail}</span>
              </span>
              {caps}
            </>
          );

          /**
           * `aria-keyshortcuts` says the same thing to a screen reader that the caps say to the
           * eye, which is why the caps themselves are decorative — announcing both would read the
           * key twice.
           */
          const shortcut = binding?.chords[0];
          const chordHint = shortcut ? { 'aria-keyshortcuts': ariaKeyshortcuts(shortcut) } : {};

          return row.href ? (
            <a className={styles.row} href={row.href} key={row.bindingId} {...chordHint}>
              {body}
            </a>
          ) : (
            <button
              className={styles.row}
              type="button"
              key={row.bindingId}
              onClick={row.run === 'shortcuts' ? onOpenShortcuts : onOpenCommand}
              {...chordHint}
            >
              {body}
            </button>
          );
        })}
      </nav>
    </section>
  );
}

export function ActionsPanel({
  currentEventSlug,
  onOpenCommand,
  open,
  onOpenChange,
}: {
  currentEventSlug?: string;
  onOpenCommand: () => void;
  /**
   * Owned by `OrganizerShell`, because the same panel is opened by a key the shell registers. Two
   * sources of truth for "is it open" would let the button and the shortcut disagree.
   */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const helperId = useId();
  const [helperOpen, setHelperOpen] = useState(false);
  const { platform, openShortcuts } = useHotkeyContext();
  const panelBinding = getBinding(SCOPES.organizerGlobal, 'actions-panel');

  /** Both are modal, so this one steps aside before whatever it hands off to comes up. */
  const handOff = (next: () => void) => {
    onOpenChange(false);
    requestAnimationFrame(next);
  };

  return (
    <>
      <button
        className={styles.trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-keyshortcuts={
          panelBinding?.chords[0] ? ariaKeyshortcuts(panelBinding.chords[0]) : undefined
        }
        onClick={() => onOpenChange(true)}
      >
        <Zap size={20} aria-hidden="true" />
        <span>Actions</span>
        {panelBinding ? (
          <KeyCaps
            className={styles.triggerKeys}
            binding={panelBinding}
            platform={platform}
            decorative
          />
        ) : null}
      </button>

      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title="Actions"
        description="Everywhere you can go from here, and the key that gets you there."
        className={styles.drawer}
      >
        <div className={styles.stack}>
          <p className={styles.hint}>
            {panelBinding ? (
              <>
                Press <KeyCaps binding={panelBinding} platform={platform} /> anywhere in the
                workspace to open this panel and <Kbd>Esc</Kbd> to close it.{' '}
              </>
            ) : null}
          </p>

          <ActionsList
            currentEventSlug={currentEventSlug}
            onOpenCommand={() => handOff(onOpenCommand)}
            onOpenShortcuts={() => handOff(openShortcuts)}
          />

          <section className={styles.section} aria-labelledby="organizer-actions-status">
            <div className={styles.sectionHeading}>
              <Activity size={15} aria-hidden="true" />
              <h3 id="organizer-actions-status">Workspace</h3>
            </div>
            <div className={styles.status}>
              <span className={styles.statusIcon} aria-hidden="true">
                <Activity size={18} />
              </span>
              <div className={styles.statusCopy}>
                <strong>Organizer workspace ready</strong>
              </div>
              <span className={styles.ready}>Ready</span>
            </div>
            <p className={styles.statusNote}>
              <strong>What ready means:</strong> you are signed in and an active event is selected
              in this browser. It does not run a live infrastructure or third-party service check.
            </p>
          </section>

          <section className={styles.section} aria-labelledby="organizer-actions-helper">
            <div className={styles.sectionHeading}>
              <MessageCircleMore size={15} aria-hidden="true" />
              <h3 id="organizer-actions-helper">Interactive helper</h3>
            </div>
            <button
              className={styles.helper}
              type="button"
              aria-expanded={helperOpen}
              aria-controls={helperId}
              onClick={() => setHelperOpen((visible) => !visible)}
            >
              <span className={styles.helperIcon} aria-hidden="true">
                <Sparkles size={18} />
              </span>
              <span className={styles.helperCopy}>
                <strong>Ask Cicero</strong>
                <span>Preview only · no tokens used</span>
              </span>
              <span className={styles.preview}>Preview</span>
            </button>
            {helperOpen ? (
              <div className={styles.helperNote} id={helperId} role="status">
                <strong>Not implemented yet</strong>
                <p>This helper is not implemented.</p>
                <Button variant="secondary" size="sm" onClick={() => setHelperOpen(false)}>
                  Got it
                </Button>
              </div>
            ) : null}
          </section>
        </div>
      </Dialog>
    </>
  );
}
