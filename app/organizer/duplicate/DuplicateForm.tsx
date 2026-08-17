'use client';

import { useState, useTransition } from 'react';
import { Button, Input, useToast } from '@/components/ui';
import { COMMON_TIMEZONES } from '@/lib/event-dates';
import { duplicateEventAction } from './actions';
import styles from './duplicate.module.css';

/**
 * `AD-1`. A client form for the same reason `NewEventForm` is one: a window that ends before it
 * starts, or a URL already in use, has to come back under the field it belongs to rather than
 * through the error boundary.
 *
 * The defaults are suggestions computed on the server — next year's name, the same weekdays 52
 * weeks on — and they are visible and editable rather than assumed. `cloneEvent` itself refuses to
 * invent a window at all, which is what keeps last year's dates from riding along unnoticed.
 */

type Props = {
  defaultName: string;
  defaultStartsAt: string;
  defaultEndsAt: string;
  defaultTimezone: string;
};

export function DuplicateForm({
  defaultName,
  defaultStartsAt,
  defaultEndsAt,
  defaultTimezone,
}: Props) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [values, setValues] = useState<Record<string, string>>({
    name: defaultName,
    slug: '',
    startsAt: defaultStartsAt,
    endsAt: defaultEndsAt,
    timezone: defaultTimezone,
  });

  const set = (key: string) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setErrors({});
    startTransition(async () => {
      const result = await duplicateEventAction(values);
      setErrors(result.details ?? {});
      toast({ title: result.message, tone: 'danger' });
    });
  };

  return (
    <form onSubmit={submit} className={styles.form}>
      <label className={styles.field}>
        <span className={styles.label}>Name</span>
        <Input value={values.name} onChange={set('name')} invalid={Boolean(errors.name)} />
        {errors.name ? <span className={styles.error}>{errors.name}</span> : null}
      </label>

      <label className={styles.field}>
        <span className={styles.label}>URL</span>
        <Input value={values.slug} onChange={set('slug')} invalid={Boolean(errors.slug)} />
        <span className={styles.hint}>Leave blank to derive it from the name.</span>
        {errors.slug ? <span className={styles.error}>{errors.slug}</span> : null}
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
      <span className={styles.hint}>
        Suggested 52 weeks on, so the same days of the week. Check them — nothing else carries a
        date across.
      </span>

      <label className={styles.field}>
        <span className={styles.label}>Time zone</span>
        <Input
          value={values.timezone}
          onChange={set('timezone')}
          list="duplicate-event-timezones"
          invalid={Boolean(errors.timezone)}
        />
        <datalist id="duplicate-event-timezones">
          {COMMON_TIMEZONES.map((zone) => (
            <option key={zone} value={zone} />
          ))}
        </datalist>
        {errors.timezone ? <span className={styles.error}>{errors.timezone}</span> : null}
      </label>

      <Button type="submit" variant="primary" loading={pending}>
        Duplicate event
      </Button>
      <span className={styles.hint}>
        Forms and review rounds arrive as drafts with their dates cleared, so nothing opens for
        submissions until you say so.
      </span>
    </form>
  );
}
