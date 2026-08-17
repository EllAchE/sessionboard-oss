'use client';

import { Fragment } from 'react';
import { RotateCcw } from 'lucide-react';
import { Switch } from '@/components/ui';
import {
  NOTIFICATION_CATEGORY_ROWS,
  type NotificationCategory,
} from '@/lib/notification-categories';
import styles from './AlertOverrideGrid.module.css';

export type ChannelOverride = boolean | null;
export type ChannelOverrides = { notifyEmail: ChannelOverride; notifySms: ChannelOverride };
export type CategoryOverrides = Record<NotificationCategory, ChannelOverrides>;

/**
 * The `'inherit' | 'on' | 'off'` spelling the portal's form action parses back into
 * `boolean | null`. The grid is controlled, so a `<form>` surface mirrors its state into hidden
 * inputs with this.
 */
export function overrideField(value: ChannelOverride): string {
  return value === null ? 'inherit' : value ? 'on' : 'off';
}

/**
 * Every alert choice for one event, as one aligned grid.
 *
 * These preferences are three deep — account default, then this event, then a category within it —
 * and each level stores `null` for "inherit". Both panels used to surface that `null` directly as
 * a dropdown whose first option was "Use global default", which made the reader do the resolving:
 * the control said `inherit` where what they wanted to know was whether the mail would arrive.
 *
 * So a switch per channel, showing the resolved answer rather than the stored one. Flipping it
 * writes an override at this level; the reset beside a row that holds one drops back to inheriting,
 * which is the only reason the tri-state still has a control at all. Nothing here is a dropdown and
 * every switch sits in the same two columns, because the ragged version of this — a label, then two
 * stacked-label selects pushed to the right edge — is what it replaces.
 */
export function AlertOverrideGrid({
  accountEmail,
  accountSms,
  smsLocked,
  event,
  onEventChange,
  categories,
  onCategoryChange,
}: {
  /** The account-wide defaults these rows inherit from, live from the switches above the grid. */
  accountEmail: boolean;
  accountSms: boolean;
  /** No verified phone on the account: the text column can be read but not changed. */
  smsLocked: boolean;
  event: ChannelOverrides;
  onEventChange(patch: ChannelOverrides): void;
  categories: CategoryOverrides;
  onCategoryChange(key: NotificationCategory, patch: ChannelOverrides): void;
}) {
  const eventEmail = event.notifyEmail ?? accountEmail;
  const eventSms = event.notifySms ?? accountSms;

  const rows = [
    {
      key: 'all',
      label: 'Everything for this event',
      lead: true,
      overrides: event,
      email: eventEmail,
      sms: eventSms,
      change: onEventChange,
    },
    ...NOTIFICATION_CATEGORY_ROWS.map(([key, label]) => ({
      key,
      label,
      lead: false,
      overrides: categories[key],
      email: categories[key].notifyEmail ?? eventEmail,
      sms: categories[key].notifySms ?? eventSms,
      change: (patch: ChannelOverrides) => onCategoryChange(key, patch),
    })),
  ];

  return (
    <div className={styles.root}>
      <div className={styles.grid} role="group" aria-label="Alerts for this event">
        <span />
        <span className={styles.columnLabel} aria-hidden>
          Email
        </span>
        <span className={styles.columnLabel} aria-hidden>
          Text
        </span>

        {rows.map((row) => {
          const overridden = row.overrides.notifyEmail !== null || row.overrides.notifySms !== null;
          return (
            <Fragment key={row.key}>
              <span className={`${styles.rowLabel} ${styles.line} ${row.lead ? '' : styles.child}`}>
                <span className={row.lead ? styles.leadName : styles.name}>{row.label}</span>
                {overridden ? (
                  <button
                    type="button"
                    className={styles.reset}
                    aria-label={`Stop overriding ${row.label.toLowerCase()}`}
                    onClick={() => row.change({ notifyEmail: null, notifySms: null })}
                  >
                    <RotateCcw size={11} aria-hidden />
                    Reset to default
                  </button>
                ) : null}
              </span>
              <span className={`${styles.cell} ${styles.line}`}>
                <Switch
                  size="sm"
                  checked={row.email}
                  aria-label={`Email for ${row.label.toLowerCase()}`}
                  onCheckedChange={(checked) =>
                    row.change({ ...row.overrides, notifyEmail: checked })
                  }
                />
              </span>
              <span className={`${styles.cell} ${styles.line}`}>
                <Switch
                  size="sm"
                  checked={row.sms}
                  disabled={smsLocked}
                  aria-label={`Text message for ${row.label.toLowerCase()}`}
                  onCheckedChange={(checked) => row.change({ ...row.overrides, notifySms: checked })}
                />
              </span>
            </Fragment>
          );
        })}
      </div>
      <p className={styles.note}>
        {smsLocked
          ? 'These follow your settings above until you change one. Verify a phone number to change the text column.'
          : 'These follow your settings above until you change one.'}
      </p>
    </div>
  );
}
