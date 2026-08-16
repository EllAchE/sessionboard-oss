'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Textarea, useToast } from '@/components/ui';
import { COMMON_EVENT_TYPES, COMMON_TIMEZONES } from '@/lib/event-dates';
import { BrandingFields } from './BrandingFields';
import { updateEventAction } from './actions';
import type { EventWire } from './types';
import styles from './settings.module.css';

/**
 * The event record itself. One save button rather than the per-cell commit the collections use:
 * the dates and the timezone are read together, and half-applying them would leave the agenda
 * rendering a day the event no longer runs on.
 *
 * `E-1` made the start and the end required instants rather than optional dates, so both boxes carry
 * a time of day and both are read in the event's own timezone, not the browser's — an organizer in
 * Berlin setting up a Los Angeles conference means 09:00 in Los Angeles. `E-2` added the metadata
 * below the fold: the columns behind description, website, venue and theme already existed and were
 * already read by the merge fields and the public pages, but nothing could write them.
 *
 * The slug is shown and not editable. `updateEvent` does not accept one, and it is the public URL
 * every submitted talk, embed and calendar invite already points at — see `tasks/W10-notes.md`.
 *
 * Branding is deliberately not part of the save: an upload commits on its own, because a file input
 * that only takes effect when you remember to press Save is a way to lose an image.
 */

type Draft = {
  name: string;
  tagline: string;
  eventType: string;
  timezone: string;
  startsAt: string;
  endsAt: string;
  venueName: string;
  venueAddress: string;
  websiteUrl: string;
  theme: string;
  descriptionMarkdown: string;
};

function draftOf(event: EventWire): Draft {
  return {
    name: event.name,
    tagline: event.tagline ?? '',
    eventType: event.eventType ?? '',
    timezone: event.timezone,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    venueName: event.venueName ?? '',
    venueAddress: event.venueAddress ?? '',
    websiteUrl: event.websiteUrl ?? '',
    theme: event.theme ?? '',
    descriptionMarkdown: event.descriptionMarkdown ?? '',
  };
}

export function EventPanel({ event, canManage }: { event: EventWire; canManage: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const saved = draftOf(event);
  const [draft, setDraft] = useState<Draft>(saved);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set =
    (key: keyof Draft) =>
    (input: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft((current) => ({ ...current, [key]: input.target.value }));

  const dirty = (Object.keys(saved) as (keyof Draft)[]).some((key) => draft[key] !== saved[key]);

  const save = () => {
    setErrors({});
    startTransition(async () => {
      const result = await updateEventAction({
        name: draft.name,
        tagline: draft.tagline,
        eventType: draft.eventType,
        timezone: draft.timezone,
        startsAt: draft.startsAt,
        endsAt: draft.endsAt,
        venueName: draft.venueName,
        venueAddress: draft.venueAddress,
        websiteUrl: draft.websiteUrl,
        theme: draft.theme,
        descriptionMarkdown: draft.descriptionMarkdown,
      });
      if (!result.ok) {
        setErrors(result.details ?? {});
        toast({ title: result.message, tone: 'danger' });
        return;
      }
      toast({ title: 'Event saved', tone: 'success' });
      router.refresh();
    });
  };

  const error = (key: keyof Draft) =>
    errors[key] ? <span className={styles.error}>{errors[key]}</span> : null;

  return (
    <section className={styles.panel} aria-label="Event">
      <p className={styles.lede}>
        What the public pages, the calendar invites and every merge field call this event.
      </p>

      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span className={styles.label}>Name</span>
          <Input
            value={draft.name}
            disabled={!canManage}
            invalid={Boolean(errors.name)}
            onChange={set('name')}
          />
          {error('name')}
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
            value={draft.tagline}
            placeholder="One line under the event name"
            disabled={!canManage}
            onChange={set('tagline')}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Event type</span>
          <Input
            value={draft.eventType}
            list="settings-event-types"
            placeholder="Conference"
            disabled={!canManage}
            invalid={Boolean(errors.eventType)}
            onChange={set('eventType')}
          />
          <datalist id="settings-event-types">
            {COMMON_EVENT_TYPES.map((kind) => (
              <option key={kind} value={kind} />
            ))}
          </datalist>
          <span className={styles.hint}>Yours to name — the list is only a suggestion.</span>
          {error('eventType')}
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Timezone</span>
          <Input
            value={draft.timezone}
            list="settings-timezones"
            disabled={!canManage}
            invalid={Boolean(errors.timezone)}
            onChange={set('timezone')}
          />
          <datalist id="settings-timezones">
            {COMMON_TIMEZONES.map((zone) => (
              <option key={zone} value={zone} />
            ))}
          </datalist>
          <span className={styles.hint}>IANA name. Every agenda time is rendered in it.</span>
          {error('timezone')}
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Starts</span>
          <Input
            type="datetime-local"
            value={draft.startsAt}
            disabled={!canManage}
            invalid={Boolean(errors.startsAt)}
            onChange={set('startsAt')}
          />
          <span className={styles.hint}>Local time in {draft.timezone.replace('_', ' ')}.</span>
          {error('startsAt')}
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Ends</span>
          <Input
            type="datetime-local"
            value={draft.endsAt}
            disabled={!canManage}
            invalid={Boolean(errors.endsAt)}
            onChange={set('endsAt')}
          />
          {error('endsAt')}
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Venue</span>
          <Input
            value={draft.venueName}
            placeholder="Pier 27 Pavilion"
            disabled={!canManage}
            onChange={set('venueName')}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Address</span>
          <Input
            value={draft.venueAddress}
            placeholder="The Embarcadero, San Francisco, CA"
            disabled={!canManage}
            onChange={set('venueAddress')}
          />
        </label>

        <label className={styles.fieldWide}>
          <span className={styles.label}>Website</span>
          <Input
            value={draft.websiteUrl}
            placeholder="https://example.com"
            disabled={!canManage}
            invalid={Boolean(errors.websiteUrl)}
            onChange={set('websiteUrl')}
          />
          <span className={styles.hint}>Linked from the public pages and the footer.</span>
          {error('websiteUrl')}
        </label>

        <label className={styles.fieldWide}>
          <span className={styles.label}>Theme</span>
          <Textarea
            value={draft.theme}
            rows={3}
            placeholder="What this edition is about"
            disabled={!canManage}
            invalid={Boolean(errors.theme)}
            onChange={set('theme')}
          />
          {error('theme')}
        </label>

        <label className={styles.fieldWide}>
          <span className={styles.label}>Description</span>
          <Textarea
            value={draft.descriptionMarkdown}
            rows={6}
            placeholder="Markdown. Shown on the public event page and available as a merge field."
            disabled={!canManage}
            invalid={Boolean(errors.descriptionMarkdown)}
            onChange={set('descriptionMarkdown')}
          />
          {error('descriptionMarkdown')}
        </label>
      </div>

      {canManage ? (
        <div className={styles.formActions}>
          <Button variant="primary" loading={pending} disabled={!dirty} onClick={save}>
            Save event
          </Button>
          {dirty ? <span className={styles.hint}>Unsaved changes</span> : null}
        </div>
      ) : null}

      <BrandingFields event={event} canManage={canManage} />
    </section>
  );
}
