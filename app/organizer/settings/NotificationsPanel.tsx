'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Switch, useToast } from '@/components/ui';
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
 * Phone and default channels stay global to the account. Volume and notification-type choices can
 * inherit those defaults or override them for the event currently open.
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
  const [smsHourlyLimit, setSmsHourlyLimit] = useState(String(prefs.smsHourlyLimit));
  const [eventNotifyEmail, setEventNotifyEmail] = useState<boolean | null>(prefs.eventNotifyEmail);
  const [eventNotifySms, setEventNotifySms] = useState<boolean | null>(prefs.eventNotifySms);
  const [categories, setCategories] = useState(prefs.categories);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const dirty =
    phone !== (prefs.phone ?? '') ||
    notifyEmail !== prefs.notifyEmail ||
    notifySms !== prefs.notifySms ||
    timezone !== (prefs.timezone ?? '') ||
    quietStart !== (prefs.quietStart ?? '') ||
    quietEnd !== (prefs.quietEnd ?? '') ||
    smsHourlyLimit !== String(prefs.smsHourlyLimit) ||
    eventNotifyEmail !== prefs.eventNotifyEmail ||
    eventNotifySms !== prefs.eventNotifySms ||
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
        smsHourlyLimit: Number(smsHourlyLimit),
        eventNotifyEmail,
        eventNotifySms,
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
          disabled={!phone.trim() || !phoneVerified}
          aria-label="Text message alerts"
          onCheckedChange={setNotifySms}
        />
      </div>

      <h3>Delivery guardrails</h3>
      <p className={styles.hint}>
        Quiet hours apply to text messages in your timezone. Email remains available, and no more
        than the hourly ceiling can be sent to your number.
      </p>
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
        <label className={styles.field}>
          <span className={styles.label}>Maximum texts per hour</span>
          <Input
            type="number"
            min={1}
            max={100}
            value={smsHourlyLimit}
            onChange={(e) => setSmsHourlyLimit(e.target.value)}
          />
        </label>
      </div>

      <h3>This event</h3>
      <div className={styles.formGrid}>
        <OverrideSelect label="Email" value={eventNotifyEmail} onChange={setEventNotifyEmail} />
        <OverrideSelect label="Text message" value={eventNotifySms} onChange={setEventNotifySms} />
      </div>

      <h3>Notification types for this event</h3>
      {(
        [
          ['submission', 'Submission updates'],
          ['session', 'Schedule changes'],
          ['task', 'Task reminders'],
          ['form', 'Submission deadlines'],
          ['adhoc', 'Organizer announcements'],
        ] as const
      ).map(([key, label]) => (
        <div className={styles.switchRow} key={key}>
          <span className={styles.switchText}><span className={styles.switchLabel}>{label}</span></span>
          <OverrideSelect
            label="Email"
            value={categories[key].notifyEmail}
            onChange={(value) => setCategories((current) => ({
              ...current,
              [key]: { ...current[key], notifyEmail: value },
            }))}
          />
          <OverrideSelect
            label="Text"
            value={categories[key].notifySms}
            onChange={(value) => setCategories((current) => ({
              ...current,
              [key]: { ...current[key], notifySms: value },
            }))}
          />
        </div>
      ))}

      <div className={styles.formActions}>
        <Button variant="primary" loading={pending} disabled={!dirty} onClick={save}>
          Save
        </Button>
        {dirty ? <span className={styles.hint}>Unsaved changes</span> : null}
      </div>
    </section>
  );
}

function OverrideSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange(value: boolean | null): void;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <select
        value={value === null ? 'inherit' : value ? 'on' : 'off'}
        onChange={(event) => onChange(event.target.value === 'inherit' ? null : event.target.value === 'on')}
      >
        <option value="inherit">Use global default</option>
        <option value="on">On</option>
        <option value="off">Off</option>
      </select>
    </label>
  );
}
