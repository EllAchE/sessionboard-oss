'use client';

import { useId, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  CalendarPlus,
  Gauge,
  HeartPulse,
  Keyboard,
  MessageCircleMore,
  Search,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { Button, Dialog, IconButton, Kbd } from '@/components/ui';
import styles from './quick-actions.module.css';

type Convenience = {
  href: string;
  label: string;
  detail: string;
  icon: React.ReactNode;
};

export function QuickActions({
  currentEventSlug,
  onOpenCommand,
}: {
  currentEventSlug?: string;
  onOpenCommand: () => void;
}) {
  const helperId = useId();
  const [open, setOpen] = useState(false);
  const [helperOpen, setHelperOpen] = useState(false);

  const conveniences: Convenience[] = [
    {
      href: '/admin',
      label: 'Organizer Forum',
      detail: 'Return to the seat of command',
      icon: <Gauge size={17} aria-hidden="true" />,
    },
    {
      href: '/events/new',
      label: 'Convene an event',
      detail: 'Raise the standard of a new programme',
      icon: <CalendarPlus size={17} aria-hidden="true" />,
    },
    {
      href: '/portal',
      label: 'Orator portal',
      detail: 'Enter the orators’ side of the Forum',
      icon: <UserRound size={17} aria-hidden="true" />,
    },
    ...(currentEventSlug
      ? [
          {
            href: `/${currentEventSlug}`,
            label: 'Public proclamation',
            detail: 'Inspect the programme as the city sees it',
            icon: <ArrowUpRight size={17} aria-hidden="true" />,
          },
        ]
      : []),
  ];

  const openCommand = () => {
    setOpen(false);
    requestAnimationFrame(onOpenCommand);
  };

  return (
    <>
      <IconButton
        className={styles.trigger}
        label="Open Forum health and commands"
        variant="secondary"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <HeartPulse size={20} aria-hidden="true" />
        <span className={styles.triggerStatus} aria-hidden="true" />
      </IconButton>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Forum health & commands"
        description="Short roads to every corner of the empire."
        className={styles.drawer}
      >
        <div className={styles.stack}>
          <div className={styles.health}>
            <span className={styles.healthIcon} aria-hidden="true">
              <Activity size={18} />
            </span>
            <div className={styles.healthCopy}>
              <strong>The Forum stands ready</strong>
              <span>You hold the keys to this event province.</span>
            </div>
            <span className={styles.ready}>All clear</span>
          </div>

          <section className={styles.section} aria-labelledby="quick-actions-shortcuts">
            <div className={styles.sectionHeading}>
              <Keyboard size={15} aria-hidden="true" />
              <h3 id="quick-actions-shortcuts">Shortcuts</h3>
            </div>
            <div className={styles.list}>
              <button className={styles.row} type="button" onClick={openCommand}>
                <span className={styles.rowIcon} aria-hidden="true">
                  <Search size={17} />
                </span>
                <span className={styles.rowCopy}>
                  <strong>Search the empire</strong>
                  <span>Find any organizer view or command</span>
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
                  <strong>Dismiss a tablet</strong>
                  <span>Return to the Forum beneath it</span>
                </span>
                <Kbd>Esc</Kbd>
              </div>
            </div>
          </section>

          <section className={styles.section} aria-labelledby="quick-actions-conveniences">
            <div className={styles.sectionHeading}>
              <Sparkles size={15} aria-hidden="true" />
              <h3 id="quick-actions-conveniences">Short roads</h3>
            </div>
            <nav className={styles.list} aria-label="Short roads through Cicero">
              {conveniences.map((item) => (
                <a className={styles.row} href={item.href} key={item.href}>
                  <span className={styles.rowIcon}>{item.icon}</span>
                  <span className={styles.rowCopy}>
                    <strong>{item.label}</strong>
                    <span>{item.detail}</span>
                  </span>
                  <ArrowUpRight className={styles.rowArrow} size={15} aria-hidden="true" />
                </a>
              ))}
            </nav>
          </section>

          <section className={styles.section} aria-labelledby="quick-actions-helper">
            <div className={styles.sectionHeading}>
              <MessageCircleMore size={15} aria-hidden="true" />
              <h3 id="quick-actions-helper">House rhetorician</h3>
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
                <strong>Consult Cicero</strong>
                <span>Wax-tablet preview · no tokens used</span>
              </span>
              <span className={styles.preview}>Wax tablet</span>
            </button>
            {helperOpen ? (
              <div className={styles.helperNote} id={helperId} role="status">
                <strong>The rhetorician has not arrived</strong>
                <p>
                  A live LLM adviser can join the household later. This wax-tablet preview starts no
                  agent, sends no prompt, and spends no model tokens.
                </p>
                <Button variant="secondary" size="sm" onClick={() => setHelperOpen(false)}>
                  Understood
                </Button>
              </div>
            ) : null}
          </section>
        </div>
      </Dialog>
    </>
  );
}
