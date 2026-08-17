'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Switch, useToast } from '@/components/ui';
import {
  AlertOverrideGrid,
  type CategoryOverrides,
  type ChannelOverrides,
} from '@/components/notifications/AlertOverrideGrid';
import { PhoneVerificationControl } from '@/components/notifications/PhoneVerificationControl';
import {
  saveMyNotificationDeliveryPrefsAction,
  saveMyNotificationPrefsAction,
} from './actions';
import type { NotificationsWire } from './types';
import styles from './settings.module.css';

/**
 * The organizer's own alert preferences — same shape as the speaker portal's profile fields
 * (`app/portal/[eventSlug]/profile/ProfileForm.tsx`), because both write the same `user` row.
 * Phone and default channels stay global to the account; the event and category choices inherit
 * those defaults until one is overridden, and both surfaces render that through the same
 * `AlertOverrideGrid` so a change to how inheritance reads only has to be made once.
 */
export function NotificationsPanel({ prefs }: { prefs: NotificationsWire }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [phone, setPhone] = useState(prefs.phone ?? '');
  const [notifyEmail, setNotifyEmail] = useState(prefs.notifyEmail);
  const [notifySms, setNotifySms] = useState(prefs.notifySms);
  const [verifiedPhone, setVerifiedPhone] = useState(
    prefs.phoneVerified ? (prefs.phone ?? null) : null,
  );
  const [timezone, setTimezone] = useState(prefs.timezone ?? '');
  const [quietStart, setQuietStart] = useState(prefs.quietStart ?? '');
  const [quietEnd, setQuietEnd] = useState(prefs.quietEnd ?? '');
  const [event, setEvent] = useState<ChannelOverrides>({
    notifyEmail: prefs.eventNotifyEmail,
    notifySms: prefs.eventNotifySms,
  });
  const [categories, setCategories] = useState<CategoryOverrides>(prefs.categories);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const dirty =
    phone !== (prefs.phone ?? '') ||
    notifyEmail !== prefs.notifyEmail ||
    notifySms !== prefs.notifySms ||
    timezone !== (prefs.timezone ?? '') ||
    quietStart !== (prefs.quietStart ?? '') ||
    quietEnd !== (prefs.quietEnd ?? '') ||
    event.notifyEmail !== prefs.eventNotifyEmail ||
    event.notifySms !== prefs.eventNotifySms ||
    JSON.stringify(categories) !== JSON.stringify(prefs.categories);

  const phoneVerified = Boolean(verifiedPhone && phone === verifiedPhone);

  const save = () => {
    setErrors({});
    startTransition(async () => {
      const result = await saveMyNotificationPrefsAction({ phone, notifyEmail, notifySms });
      if (!result.ok) {
        setErrors(result.details ?? {});
        toast({ title: result.message, tone: 'danger' });
        return;
      }
      const delivery = await saveMyNotificationDeliveryPrefsAction({
        timezone: timezone.trim() || null,
        quietStart: quietStart || null,
        quietEnd: quietEnd || null,
        // No `smsHourlyLimit`: the hourly cap is a guardrail the service defaults, not something
        // worth a box on this panel. Omitting it leaves whatever the account already stores.
        eventNotifyEmail: event.notifyEmail,
        eventNotifySms: event.notifySms,
        categories,
      });
      if (!delivery.ok) {
        setErrors(delivery.details ?? {});
        toast({ title: delivery.message, tone: 'danger' });
        return;
      }
      toast({ title: 'Notification preferences saved', tone: 'success' });
      router.refresh();
    });
  };

  return (
    <section className={styles.panel} aria-label="Notifications">
      <p className={styles.lede}>How Cicero contacts you across all events.</p>

      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span className={styles.label}>Phone number</span>
          <Input
            type="tel"
            autoComplete="tel"
            value={phone}
            placeholder="+1 555 123 4567"
            invalid={Boolean(errors.phone)}
            onChange={(e) => {
              setPhone(e.target.value);
              if (e.target.value !== verifiedPhone) setNotifySms(false);
            }}
          />
          {errors.phone ? <span className={styles.error}>{errors.phone}</span> : null}
        </label>
        <PhoneVerificationControl
          phone={phone}
          verified={phoneVerified}
          onVerified={(normalized) => {
            setPhone(normalized);
            setVerifiedPhone(normalized);
          }}
        />
      </div>

      <div className={styles.switchRow}>
        <span className={styles.switchText}>
          <span className={styles.switchLabel}>Email</span>
          <span className={styles.hint}>Reminders, decisions, and schedule changes.</span>
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
          disabled={!phone.trim() || !phoneVerified}
          aria-label="Text message alerts"
          onCheckedChange={setNotifySms}
        />
      </div>

      <div className={styles.subPanel}>
        <h3 className={styles.subTitle}>Quiet hours</h3>
        <p className={styles.hint}>Texts pause between these times. Email is unaffected.</p>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span className={styles.label}>Your timezone</span>
            <Input value={timezone} placeholder="America/New_York" onChange={(e) => setTimezone(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Quiet hours start</span>
            <Input type="time" value={quietStart} onChange={(e) => setQuietStart(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Quiet hours end</span>
            <Input type="time" value={quietEnd} onChange={(e) => setQuietEnd(e.target.value)} />
          </label>
        </div>
      </div>

      <div className={styles.subPanel}>
        <h3 className={styles.subTitle}>This event</h3>
        <AlertOverrideGrid
          accountEmail={notifyEmail}
          accountSms={notifySms}
          smsLocked={!phoneVerified}
          event={event}
          onEventChange={setEvent}
          categories={categories}
          onCategoryChange={(key, patch) =>
            setCategories((current) => ({ ...current, [key]: patch }))
          }
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
