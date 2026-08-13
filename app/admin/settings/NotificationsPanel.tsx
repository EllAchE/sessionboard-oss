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
      toast({ title: 'Courier edicts sealed', tone: 'success' });
      router.refresh();
    });
  };

  return (
    <section className={styles.panel} aria-label="Courier edicts">
      <p className={styles.lede}>
        How Cicero reaches you—reminders, verdicts, and every other summons addressed to your
        citizen account across all the assemblies you govern.
      </p>

      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span className={styles.label}>Courier number</span>
          <Input
            type="tel"
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
          <span className={styles.switchLabel}>Email courier</span>
          <span className={styles.hint}>Reminders, verdicts, and oration details by email.</span>
        </span>
        <Switch checked={notifyEmail} aria-label="Email summons" onCheckedChange={setNotifyEmail} />
      </div>
      <div className={styles.switchRow}>
        <span className={styles.switchText}>
          <span className={styles.switchLabel}>SMS courier</span>
          <span className={styles.hint}>
            {phone.trim()
              ? 'The same summons, dispatched to your phone by SMS.'
              : 'Inscribe a courier number above to summon this route.'}
          </span>
        </span>
        <Switch
          checked={notifySms}
          disabled={!phone.trim()}
          aria-label="SMS summons"
          onCheckedChange={setNotifySms}
        />
      </div>

      <div className={styles.formActions}>
        <Button variant="primary" loading={pending} disabled={!dirty} onClick={save}>
          Seal edicts
        </Button>
        {dirty ? <span className={styles.hint}>Unsealed changes</span> : null}
      </div>
    </section>
  );
}
