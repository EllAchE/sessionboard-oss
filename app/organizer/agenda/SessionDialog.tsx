'use client';

import { useEffect, useState, useTransition } from 'react';
import { Button, Dialog, Input, Select, Textarea } from '@/components/ui';
import {
  formatMinutes,
  isPlaced,
  zonedDayKey,
  zonedMinutes,
  zonedTimeToUtc,
  type Conflict,
  type QueueItem,
  type ScheduleEntry,
} from '@/lib/services/schedule';
import { describeHold, type PublicHold } from '@/lib/public-visibility';
import type { NamedFormat, NamedRoom, NamedTrack } from './wire';
import styles from './agenda.module.css';

/**
 * `A-4` session fields plus the manual-scheduling path: a keynote, a break or lunch never came from
 * a submission and still has to hold a slot. Times are entered as wall-clock in the event's zone and
 * converted here; the dialog never shows the viewer's local time, which would silently move a talk
 * for an organizer travelling to their own conference.
 */

export type SessionDraft = {
  sessionId: string | null;
  sourceSubmissionId: string | null;
  title: string;
  descriptionMarkdown: string;
  roomId: string;
  trackId: string;
  formatId: string;
  dayKey: string;
  startTime: string;
  endTime: string;
  ceuCredits: string;
  clientId: string;
};

export function draftFor(
  entry: ScheduleEntry | null,
  timeZone: string,
  fallbackDayKey: string,
): SessionDraft {
  if (!entry) {
    return {
      sessionId: null,
      sourceSubmissionId: null,
      title: '',
      descriptionMarkdown: '',
      roomId: '',
      trackId: '',
      formatId: '',
      dayKey: fallbackDayKey,
      startTime: '09:00',
      endTime: '09:45',
      ceuCredits: '',
      clientId: '',
    };
  }

  return {
    sessionId: entry.id,
    sourceSubmissionId: null,
    title: entry.title,
    descriptionMarkdown: '',
    roomId: entry.roomId ?? '',
    trackId: entry.trackId ?? '',
    formatId: entry.formatId ?? '',
    dayKey: isPlaced(entry) ? zonedDayKey(entry.startsAt, timeZone) : fallbackDayKey,
    startTime: isPlaced(entry) ? formatMinutes(zonedMinutes(entry.startsAt, timeZone)) : '',
    endTime: isPlaced(entry) ? formatMinutes(zonedMinutes(entry.endsAt, timeZone)) : '',
    ceuCredits: entry.ceuCredits ?? '',
    clientId: entry.clientId ?? '',
  };
}

export function draftForQueueItem(
  item: QueueItem,
  fallbackDayKey: string,
): SessionDraft {
  return {
    sessionId: item.kind === 'session' ? item.id : null,
    sourceSubmissionId: item.kind === 'submission' ? item.id : null,
    title: item.title,
    descriptionMarkdown: item.descriptionMarkdown ?? '',
    roomId: '',
    trackId: item.trackId ?? '',
    formatId: item.formatId ?? '',
    dayKey: fallbackDayKey,
    startTime: '09:00',
    endTime: '',
    ceuCredits: '',
    clientId: '',
  };
}

function minutesFromInput(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes >= 0 && minutes <= 1440 ? minutes : null;
}

export type SavePayload = {
  sessionId: string | null;
  sourceSubmissionId: string | null;
  title: string;
  descriptionMarkdown: string | null;
  roomId: string | null;
  trackId: string | null;
  formatId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  ceuCredits: string | null;
  clientId: string | null;
};

export function SessionDialog({
  open,
  draft,
  timeZone,
  dayKeys,
  rooms,
  tracks,
  formats,
  conflicts,
  status,
  holds,
  onOpenChange,
  onSave,
  onDelete,
  onUnschedule,
  onStatusChange,
}: {
  open: boolean;
  draft: SessionDraft | null;
  timeZone: string;
  dayKeys: string[];
  rooms: NamedRoom[];
  tracks: NamedTrack[];
  formats: NamedFormat[];
  conflicts: Conflict[];
  status: ScheduleEntry['status'] | null;
  /** `lib/public-visibility.ts`. Empty unless publishing this session was not enough to show it. */
  holds: PublicHold[];
  onOpenChange: (open: boolean) => void;
  onSave: (payload: SavePayload) => Promise<string | null>;
  onDelete: (sessionId: string) => Promise<void>;
  onUnschedule: (sessionId: string) => Promise<void>;
  onStatusChange: (sessionId: string, next: 'draft' | 'published' | 'cancelled') => Promise<void>;
}) {
  const [form, setForm] = useState<SessionDraft | null>(draft);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setForm(draft);
    setError(null);
  }, [draft]);

  if (!form) return null;

  const set = <K extends keyof SessionDraft>(key: K, value: SessionDraft[K]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));

  const submit = () => {
    if (!form.title.trim()) {
      setError('Give the session a title.');
      return;
    }

    const startMinute = form.startTime ? minutesFromInput(form.startTime) : null;
    const endMinute = form.endTime ? minutesFromInput(form.endTime) : null;

    if (form.startTime && startMinute === null) {
      setError('Start time should look like 09:30.');
      return;
    }
    if (form.endTime && endMinute === null) {
      setError('End time should look like 10:15.');
      return;
    }
    if (startMinute !== null && endMinute !== null && endMinute <= startMinute) {
      setError('A session has to end after it starts.');
      return;
    }

    // Typed times are taken exactly as entered; only a drop on the grid snaps to a slot.
    const startsAt =
      startMinute === null
        ? null
        : zonedTimeToUtc(form.dayKey, startMinute, timeZone).toISOString();
    const endsAt =
      endMinute === null ? null : zonedTimeToUtc(form.dayKey, endMinute, timeZone).toISOString();

    setError(null);
    startTransition(async () => {
      const saveError = await onSave({
        sessionId: form.sessionId,
        sourceSubmissionId: form.sourceSubmissionId,
        title: form.title.trim(),
        descriptionMarkdown: form.descriptionMarkdown.trim() || null,
        roomId: form.roomId || null,
        trackId: form.trackId || null,
        formatId: form.formatId || null,
        startsAt,
        endsAt,
        ceuCredits: form.ceuCredits.trim() || null,
        clientId: form.clientId.trim() || null,
      });
      setError(saveError);
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={form.sessionId ? 'Edit session' : 'Add a session'}
      description={
        form.sessionId
          ? 'Times are in the event timezone.'
          : form.sourceSubmissionId
            ? 'Schedule this accepted proposal. Its speakers and submission stay linked.'
          : 'For anything without a submission behind it: a keynote, a break, lunch.'
      }
      size="lg"
      footer={
        <div className={styles.detailActions}>
          <Button variant="primary" onClick={submit} loading={pending}>
            Save
          </Button>
          {form.sessionId && status !== 'published' && (
            <Button
              onClick={() => form.sessionId && onStatusChange(form.sessionId, 'published')}
            >
              Publish
            </Button>
          )}
          {form.sessionId && status === 'published' && (
            <Button onClick={() => form.sessionId && onStatusChange(form.sessionId, 'draft')}>
              Return to draft
            </Button>
          )}
          {form.sessionId && (
            <Button onClick={() => form.sessionId && onUnschedule(form.sessionId)}>
              Unschedule
            </Button>
          )}
          {form.sessionId && (
            <Button variant="danger" onClick={() => form.sessionId && onDelete(form.sessionId)}>
              Delete
            </Button>
          )}
        </div>
      }
    >
      <div className={styles.form}>
        {conflicts.length > 0 && (
          <div className={`${styles.banner} ${styles.bannerError}`}>
            <span>
              {conflicts.map((conflict) => conflict.message).join(' · ')}
            </span>
          </div>
        )}

        {/*
          Published is not the same as visible, and this dialog is where an organizer comes to ask
          why. One banner per hold, each naming the thing to go and fix.
        */}
        {holds.map((hold) => (
          <div
            key={hold.kind}
            className={`${styles.banner} ${styles.bannerWarning}`}
            role="status"
          >
            <span>{describeHold(hold)}</span>
          </div>
        ))}

        <div className={styles.field}>
          <label className={styles.label} htmlFor="agenda-title">
            Title
          </label>
          <Input
            id="agenda-title"
            value={form.title}
            onChange={(fired) => set('title', fired.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="agenda-description">
            Description
          </label>
          <Textarea
            id="agenda-description"
            rows={3}
            value={form.descriptionMarkdown}
            onChange={(fired) => set('descriptionMarkdown', fired.target.value)}
          />
        </div>

        <div className={styles.formRow}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="agenda-room">
              Room
            </label>
            <Select
              id="agenda-room"
              value={form.roomId}
              onChange={(fired) => set('roomId', fired.target.value)}
            >
              <option value="">No room</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </Select>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="agenda-track">
              Track
            </label>
            <Select
              id="agenda-track"
              value={form.trackId}
              onChange={(fired) => set('trackId', fired.target.value)}
            >
              <option value="">No track</option>
              {tracks.map((track) => (
                <option key={track.id} value={track.id}>
                  {track.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className={styles.formRow}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="agenda-day">
              Day
            </label>
            <Select
              id="agenda-day"
              value={form.dayKey}
              onChange={(fired) => set('dayKey', fired.target.value)}
            >
              {dayKeys.map((dayKey) => (
                <option key={dayKey} value={dayKey}>
                  {dayKey}
                </option>
              ))}
            </Select>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="agenda-format">
              Format
            </label>
            <Select
              id="agenda-format"
              value={form.formatId}
              onChange={(fired) => set('formatId', fired.target.value)}
            >
              <option value="">No format</option>
              {formats.map((format) => (
                <option key={format.id} value={format.id}>
                  {format.name} ({format.durationMinutes} min)
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className={styles.formRow}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="agenda-start">
              Starts at ({timeZone})
            </label>
            <Input
              id="agenda-start"
              placeholder="09:00"
              value={form.startTime}
              onChange={(fired) => set('startTime', fired.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="agenda-end">
              Ends at
            </label>
            <Input
              id="agenda-end"
              placeholder="09:45"
              value={form.endTime}
              onChange={(fired) => set('endTime', fired.target.value)}
            />
          </div>
        </div>

        <div className={styles.formRow}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="agenda-ceu">
              CEU credits
            </label>
            <Input
              id="agenda-ceu"
              value={form.ceuCredits}
              onChange={(fired) => set('ceuCredits', fired.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="agenda-client">
              Client ID
            </label>
            <Input
              id="agenda-client"
              value={form.clientId}
              onChange={(fired) => set('clientId', fired.target.value)}
            />
          </div>
        </div>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
