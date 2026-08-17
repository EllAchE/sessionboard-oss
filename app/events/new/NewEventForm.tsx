'use client';

import { useState, useTransition } from 'react';
import { Button, Input, useToast } from '@/components/ui';
import type { ToastOptions } from '@/components/ui';
import { COMMON_EVENT_TYPES, COMMON_TIMEZONES } from '@/lib/event-dates';
import { createEventAction, type CreateEventResult } from '@/app/organizer/shell-actions';
import styles from './new-event.module.css';

/**
 * `E-1`. A client form rather than a bare `<form action>` because the create path now validates —
 * a start that lands after its end, or a timezone that is not a zone, has to come back under the
 * field it belongs to instead of through the error boundary.
 *
 * The two defaults are computed on the server and passed in, so the first render matches and the
 * form is already filled with something plausible: a start and an end are required, and making
 * somebody type both before they can see anything is a poor first minute.
 */

type Props = {
  defaultStartsAt: string;
  defaultEndsAt: string;
  defaultTimezone: string;
};

/**
 * What a submit should draw, given whatever the action settled with. Split out from the handler so
 * the two cases can be pinned without a browser.
 *
 * A create that worked comes back as nothing — the action sets the event cookie and redirects — so
 * there is no failure to announce and no field to mark. The form used to skip that distinction and
 * read `.details` off every outcome, which both raised a danger toast on a successful create and
 * threw a `TypeError` the moment the success path resolved instead of throwing. No success toast:
 * the router is already leaving this page for `/organizer`, which is the confirmation.
 */
export function createEventFeedback(result: CreateEventResult): {
  errors: Record<string, string>;
  toast: ToastOptions | null;
} {
  if (!result) return { errors: {}, toast: null };
  return { errors: result.details ?? {}, toast: { title: result.message, tone: 'danger' } };
}

export function NewEventForm({ defaultStartsAt, defaultEndsAt, defaultTimezone }: Props) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [values, setValues] = useState<Record<string, string>>({
    name: '',
    slug: '',
    tagline: '',
    eventType: '',
    startsAt: defaultStartsAt,
    endsAt: defaultEndsAt,
    timezone: defaultTimezone,
    venueName: '',
    websiteUrl: '',
  });

  const set = (key: string) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setErrors({});
    startTransition(async () => {
      // Deliberately not wrapped in try/catch. A successful create redirects, and Next signals that
      // by throwing `NEXT_REDIRECT` through the caller; catching here would swallow the navigation
      // and report the event that was just created as a failure.
      const feedback = createEventFeedback(await createEventAction(values));
      setErrors(feedback.errors);
      if (feedback.toast) toast(feedback.toast);
    });
  };

  return (
    <form onSubmit={submit} className={styles.form}>
      <label className={styles.field}>
        <span className={styles.label}>Name</span>
        <Input
          value={values.name}
          onChange={set('name')}
          invalid={Boolean(errors.name)}
          placeholder="Cascadia Systems Conf 2026"
        />
        {errors.name ? <span className={styles.error}>{errors.name}</span> : null}
      </label>

      <label className={styles.field}>
        <span className={styles.label}>URL</span>
        <Input
          value={values.slug}
          onChange={set('slug')}
          invalid={Boolean(errors.slug)}
          placeholder="cascadia-2026"
        />
        <span className={styles.hint}>Leave blank to derive it from the name.</span>
        {errors.slug ? <span className={styles.error}>{errors.slug}</span> : null}
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Tagline</span>
        <Input
          value={values.tagline}
          onChange={set('tagline')}
          placeholder="Two days on the systems we actually run"
        />
      </label>

      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>Starts</span>
          <Input
            type="datetime-local"
            value={values.startsAt}
            onChange={set('startsAt')}
            invalid={Boolean(errors.startsAt)}
          />
          {errors.startsAt ? <span className={styles.error}>{errors.startsAt}</span> : null}
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Ends</span>
          <Input
            type="datetime-local"
            value={values.endsAt}
            onChange={set('endsAt')}
            invalid={Boolean(errors.endsAt)}
          />
          {errors.endsAt ? <span className={styles.error}>{errors.endsAt}</span> : null}
        </label>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Time zone</span>
        <Input
          value={values.timezone}
          onChange={set('timezone')}
          list="new-event-timezones"
          invalid={Boolean(errors.timezone)}
        />
        <datalist id="new-event-timezones">
          {COMMON_TIMEZONES.map((zone) => (
            <option key={zone} value={zone} />
          ))}
        </datalist>
        <span className={styles.hint}>Both times above are read in this zone.</span>
        {errors.timezone ? <span className={styles.error}>{errors.timezone}</span> : null}
      </label>

      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>Event type</span>
          <Input
            value={values.eventType}
            onChange={set('eventType')}
            list="new-event-types"
            placeholder="Conference"
          />
          <datalist id="new-event-types">
            {COMMON_EVENT_TYPES.map((kind) => (
              <option key={kind} value={kind} />
            ))}
          </datalist>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Venue</span>
          <Input value={values.venueName} onChange={set('venueName')} placeholder="Pier 27 Pavilion" />
        </label>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Website</span>
        <Input
          value={values.websiteUrl}
          onChange={set('websiteUrl')}
          invalid={Boolean(errors.websiteUrl)}
          placeholder="https://example.com"
        />
        {errors.websiteUrl ? <span className={styles.error}>{errors.websiteUrl}</span> : null}
      </label>

      <Button type="submit" variant="primary" loading={pending}>
        Create event
      </Button>
      <span className={styles.hint}>Everything but the name, dates and zone can change later.</span>
    </form>
  );
}
