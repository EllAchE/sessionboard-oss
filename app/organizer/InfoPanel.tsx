'use client';

import { useState } from 'react';
import { Info, Keyboard, Search } from 'lucide-react';
import { useHotkeyContext } from '@/components/hotkeys/HotkeyProvider';
import { KeyCaps } from '@/components/hotkeys/KeyCaps';
import { Button, Dialog, Kbd } from '@/components/ui';
import { SCOPES, getBinding } from '@/lib/hotkeys/registry';
import styles from './quick-actions.module.css';

/**
 * The two rows here are the keys worth naming in a panel: the one that opens everything else, and
 * the one that closes whatever is on top. The full list is generated from the registry against the
 * screen you are on, so this deliberately points at it rather than trying to reproduce it — the
 * hand-written version of that list documented two shortcuts out of the twenty-odd that shipped.
 *
 * The caps themselves come from the registry too. They were written out here once, and by the time
 * the keys were rebound this panel was advertising `?` for a shortcut that had become ⌘⌃/ — the
 * failure that two rows of hand-written help are always one change away from.
 */
export function ShortcutList({
  onOpenCommand,
  onOpenShortcuts,
}: {
  onOpenCommand: () => void;
  onOpenShortcuts?: () => void;
}) {
  const { platform } = useHotkeyContext();
  const paletteBinding = getBinding(SCOPES.organizerGlobal, 'command-palette');
  const shortcutsBinding = getBinding(SCOPES.organizerGlobal, 'shortcuts-help');

  return (
    <section className={styles.section} aria-labelledby="cicero-shortcuts">
      <div className={styles.sectionHeading}>
        <Keyboard size={15} aria-hidden="true" />
        <h3 id="cicero-shortcuts">Organizer shortcuts</h3>
      </div>
      <div className={styles.list}>
        <button className={styles.row} type="button" onClick={onOpenCommand}>
          <span className={styles.rowIcon} aria-hidden="true">
            <Search size={17} />
          </span>
          <span className={styles.rowCopy}>
            <strong>Search and jump</strong>
            <span>Find any organizer view or action</span>
          </span>
          {paletteBinding ? (
            <KeyCaps className={styles.keys} binding={paletteBinding} platform={platform} />
          ) : null}
        </button>
        <div className={styles.row}>
          <span className={styles.rowIcon} aria-hidden="true">
            <Keyboard size={17} />
          </span>
          <span className={styles.rowCopy}>
            <strong>Close an open panel</strong>
            <span>Return to the view beneath it</span>
          </span>
          <Kbd>Esc</Kbd>
        </div>
        {onOpenShortcuts ? (
          <button className={styles.row} type="button" onClick={onOpenShortcuts}>
            <span className={styles.rowIcon} aria-hidden="true">
              <Keyboard size={17} />
            </span>
            <span className={styles.rowCopy}>
              <strong>See every shortcut</strong>
              <span>What these keys do on this screen</span>
            </span>
            {shortcutsBinding ? (
              <KeyCaps className={styles.keys} binding={shortcutsBinding} platform={platform} />
            ) : null}
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function InfoPanel({
  onOpenCommand,
  onOpenShortcuts,
}: {
  onOpenCommand: () => void;
  onOpenShortcuts: () => void;
}) {
  const [open, setOpen] = useState(false);

  const openCommand = () => {
    setOpen(false);
    requestAnimationFrame(onOpenCommand);
  };

  /** Both dialogs are modal, so this one steps aside before the shortcut overlay comes up. */
  const openShortcuts = () => {
    setOpen(false);
    requestAnimationFrame(onOpenShortcuts);
  };

  return (
    <>
      <Button
        className={styles.infoTrigger}
        variant="ghost"
        size="sm"
        iconLeft={<Info size={16} aria-hidden="true" />}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className={styles.infoTriggerText}>Info</span>
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Keyboard shortcuts"
        description="Quick keyboard help for navigating the organizer workspace."
        size="sm"
      >
        <ShortcutList onOpenCommand={openCommand} onOpenShortcuts={openShortcuts} />
      </Dialog>
    </>
  );
}
