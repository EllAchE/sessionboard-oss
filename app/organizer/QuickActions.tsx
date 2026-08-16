'use client';

import { useId, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  CalendarPlus,
  Gauge,
  HeartPulse,
  MessageCircleMore,
  Search,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { Button, Dialog } from '@/components/ui';
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
      href: '/organizer',
      label: 'Organizer dashboard',
      detail: 'Return to your event overview',
      icon: <Gauge size={17} aria-hidden="true" />,
    },
    {
      href: '/events/new',
      label: 'Create an event',
      detail: 'Start a new programme',
      icon: <CalendarPlus size={17} aria-hidden="true" />,
    },
    {
      href: '/portal',
      label: 'Speaker portal',
      detail: 'Open the participant experience',
      icon: <UserRound size={17} aria-hidden="true" />,
    },
    ...(currentEventSlug
      ? [
          {
            href: `/${currentEventSlug}`,
            label: 'Public programme',
            detail: 'Preview the attendee-facing agenda',
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
      <button
        className={styles.trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <HeartPulse size={20} aria-hidden="true" />
        <span>Health</span>
        <span className={styles.triggerState}>
          <span className={styles.triggerStatus} aria-hidden="true" />
          Ready
        </span>
      </button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Health & quick actions"
        description="Shortcuts and system status."
        className={styles.drawer}
      >
        <div className={styles.stack}>
          <div className={styles.health}>
            <span className={styles.healthIcon} aria-hidden="true">
              <Activity size={18} />
            </span>
            <div className={styles.healthCopy}>
              <strong>Organizer workspace ready</strong>
            </div>
            <span className={styles.ready}>Ready</span>
          </div>
          <p className={styles.healthNote}>
            <strong>What Health means:</strong> you are signed in and an active event is selected in
            this browser. It does not run a live infrastructure or third-party service check.
          </p>

          <section className={styles.section} aria-labelledby="quick-actions-links">
            <div className={styles.sectionHeading}>
              <Sparkles size={15} aria-hidden="true" />
              <h3 id="quick-actions-links">Quick actions</h3>
            </div>
            <nav className={styles.list} aria-label="Quick actions">
              <button className={styles.row} type="button" onClick={openCommand}>
                <span className={styles.rowIcon} aria-hidden="true">
                  <Search size={17} />
                </span>
                <span className={styles.rowCopy}>
                  <strong>Search and jump</strong>
                  <span>Find any organizer view or action</span>
                </span>
                <ArrowUpRight className={styles.rowArrow} size={15} aria-hidden="true" />
              </button>
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
              <h3 id="quick-actions-helper">Interactive helper</h3>
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
