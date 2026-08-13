'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, useToast } from '@/components/ui';
import { updateEventAction } from './actions';
import type { EventWire } from './types';
import styles from './settings.module.css';

/**
 * The event record itself. One save button rather than the per-cell commit the collections use:
 * the dates and the timezone are read together, and half-applying them would leave the agenda
 * rendering a day the event no longer runs on.
 *
 * The slug is shown and not editable. `updateEvent` does not accept one, and it is the public URL
 * every submitted talk, embed and calendar invite already points at — see `tasks/W10-notes.md`.
 */

const COMMON_ZONES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Madrid',
  'Asia/Tokyo',
  'Australia/Sydney',
  'UTC',
];

export function EventPanel({ event, canManage }: { event: EventWire; canManage: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(event.name);
  const [tagline, setTagline] = useState(event.tagline ?? '');
  const [timezone, setTimezone] = useState(event.timezone);
  const [startsOn, setStartsOn] = useState(event.startsOn ?? '');
  const [endsOn, setEndsOn] = useState(event.endsOn ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const dirty =
    name !== event.name ||
    tagline !== (event.tagline ?? '') ||
    timezone !== event.timezone ||
    startsOn !== (event.startsOn ?? '') ||
    endsOn !== (event.endsOn ?? '');

  const save = () => {
    setErrors({});
    startTransition(async () => {
      const result = await updateEventAction({
        name,
        tagline: tagline || null,
        timezone,
        startsOn: startsOn || null,
        endsOn: endsOn || null,
      });
      if (!result.ok) {
        setErrors(result.details ?? {});
        toast({ title: result.message, tone: 'danger' });
        return;
      }
      toast({ title: 'Founding charter inscribed', tone: 'success' });
      router.refresh();
    });
  };

  return (
    <section className={styles.panel} aria-label="Founding charter">
      <p className={styles.lede}>
        What the public pages, the calendar invites and every merge field call this event.
      </p>

      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span className={styles.label}>Name</span>
          <Input
            value={name}
            disabled={!canManage}
            invalid={Boolean(errors.name)}
            onChange={(e) => setName(e.target.value)}
          />
          {errors.name ? <span className={styles.error}>{errors.name}</span> : null}
        </label>

        <label className={styles.field}>
          <span className={styles.label}>URL</span>
          <Input value={`/${event.slug}`} readOnly disabled className={styles.mono} />
          <span className={styles.hint}>
            Fixed once the event exists — links, embeds and invites already point here.
          </span>
        </label>

        <label className={styles.fieldWide}>
          <span className={styles.label}>Tagline</span>
          <Input
            value={tagline}
            placeholder="The proclamation beneath the event name"
            disabled={!canManage}
            onChange={(e) => setTagline(e.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Timezone</span>
          <Input
            value={timezone}
            list="settings-timezones"
            disabled={!canManage}
            invalid={Boolean(errors.timezone)}
            onChange={(e) => setTimezone(e.target.value)}
          />
          <datalist id="settings-timezones">
            {COMMON_ZONES.map((zone) => (
              <option key={zone} value={zone} />
            ))}
          </datalist>
          <span className={styles.hint}>IANA name. Every hour in the fasti follows it.</span>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Starts on</span>
          <Input
            type="date"
            value={startsOn}
            disabled={!canManage}
            onChange={(e) => setStartsOn(e.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Ends on</span>
          <Input
            type="date"
            value={endsOn}
            disabled={!canManage}
            invalid={Boolean(errors.endsOn)}
            onChange={(e) => setEndsOn(e.target.value)}
          />
          {errors.endsOn ? <span className={styles.error}>{errors.endsOn}</span> : null}
        </label>
      </div>

      {canManage ? (
        <div className={styles.formActions}>
          <Button variant="primary" loading={pending} disabled={!dirty} onClick={save}>
            Seal charter
          </Button>
          {dirty ? <span className={styles.hint}>Uninscribed changes</span> : null}
        </div>
      ) : null}
    </section>
  );
}
