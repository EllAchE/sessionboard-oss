'use client';

import { useState } from 'react';
import { Info, Keyboard, Search } from 'lucide-react';
import { Button, Dialog, Kbd } from '@/components/ui';
import styles from './quick-actions.module.css';

export function ShortcutList({ onOpenCommand }: { onOpenCommand: () => void }) {
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
          <span className={styles.keys} aria-label="Command or Control K">
            <Kbd>⌘ / Ctrl</Kbd>
            <Kbd>K</Kbd>
          </span>
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
      </div>
    </section>
  );
}

export function InfoPanel({ onOpenCommand }: { onOpenCommand: () => void }) {
  const [open, setOpen] = useState(false);

  const openCommand = () => {
    setOpen(false);
    requestAnimationFrame(onOpenCommand);
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
        <ShortcutList onOpenCommand={openCommand} />
      </Dialog>
    </>
  );
}
