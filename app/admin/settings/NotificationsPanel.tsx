'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Switch, useToast } from '@/components/ui';
import { saveMyNotificationPrefsAction } from './actions';
import type { NotificationsWire } from './types';
import styles from './settings.module.css';

/**
 * The organizer's own alert preferences — same shape as the speaker portal's profile fields
 * (`app/portal/[eventSlug]/profile/ProfileForm.tsx`), because both write the same `user` row.
 * Scoped to "your" prefs rather than a per-event setting: an organizer who manages three events
 * still has one phone number.
 */
export function NotificationsPanel({ prefs }: { prefs: NotificationsWire }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [phone, setPhone] = useState(prefs.phone ?? '');
  const [notifyEmail, setNotifyEmail] = useState(prefs.notifyEmail);
  const [notifySms, setNotifySms] = useState(prefs.notifySms);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const dirty =
    phone !== (prefs.phone ?? '') || notifyEmail !== prefs.notifyEmail || notifySms !== prefs.notifySms;

  const save = () => {
    setErrors({});
    startTransition(async () => {
      const result = await saveMyNotificationPrefsAction({ phone, notifyEmail, notifySms });
      if (!result.ok) {
        setErrors(result.details ?? {});
        toast({ title: result.message, tone: 'danger' });
        return;
      }
      toast({ title: 'Notification preferences saved', tone: 'success' });
      router.refresh();
    });
  };

  return (
    <section className={styles.panel} aria-label="Notifications">
      <p className={styles.lede}>
        How Cicero reaches you — reminders, decisions and anything else addressed to your account,
        across every event you organize.
      </p>

      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span className={styles.label}>Phone number</span>
          <Input
            type="tel"
            autoComplete="tel"
            value={phone}
            placeholder="+1 555 123 4567"
            invalid={Boolean(errors.phone)}
            onChange={(e) => setPhone(e.target.value)}
          />
          {errors.phone ? <span className={styles.error}>{errors.phone}</span> : null}
        </label>
      </div>

      <div className={styles.switchRow}>
        <span className={styles.switchText}>
          <span className={styles.switchLabel}>Email</span>
          <span className={styles.hint}>Reminders, decisions and session details by email.</span>
        </span>
        <Switch checked={notifyEmail} aria-label="Email alerts" onCheckedChange={setNotifyEmail} />
      </div>
      <div className={styles.switchRow}>
        <span className={styles.switchText}>
          <span className={styles.switchLabel}>Text message</span>
          <span className={styles.hint}>
            {phone.trim()
              ? 'Turning this on records your consent. Message rates may apply; reply STOP to opt out or HELP for help.'
              : 'Add a phone number above to turn this on.'}
          </span>
        </span>
        <Switch
          checked={notifySms}
          disabled={!phone.trim()}
          aria-label="Text message alerts"
          onCheckedChange={setNotifySms}
        />
      </div>

      <div className={styles.formActions}>
        <Button variant="primary" loading={pending} disabled={!dirty} onClick={save}>
          Save
        </Button>
        {dirty ? <span className={styles.hint}>Unsaved changes</span> : null}
      </div>
    </section>
  );
}
