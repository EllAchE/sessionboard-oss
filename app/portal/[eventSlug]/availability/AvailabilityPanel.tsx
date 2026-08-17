'use client';

import { useActionState } from 'react';
import { CalendarX2 } from 'lucide-react';
import { Badge, Card, CardBody, CardHeader, CardTitle, Input, Textarea } from '@/components/ui';
import type { UnavailabilityWindow } from '@/lib/services/speaker-availability';
import { IDLE_STATE } from '../../form-state';
import styles from '../../portal.module.css';
import { addUnavailabilityAction, removeUnavailabilityAction } from '../actions';
import { FieldError, FormNotice, SubmitButton } from '../FormNotice';

/**
 * `AD-2`. What the speaker declares here is *absence*, not availability. The empty state below says
 * so in as many words, because the difference decides what an organizer is entitled to assume: with
 * no rows they may schedule the speaker anywhere, and a speaker who reads this page as "declare when
 * you are free" and then writes nothing would be making the opposite promise.
 *
 * Every time on this page is in one zone and the panel says which, at the top, before the fields.
 * The alternative — a zone picker per window — puts the most error-prone control in the product on
 * the screen with the least context, and a window entered in the wrong zone is not a smaller bug
 * than no window at all.
 */
export function AvailabilityPanel({
  eventSlug,
  windows,
  timezone,
  timezoneSource,
  formatWindow,
}: {
  eventSlug: string;
  windows: UnavailabilityWindow[];
  /** The zone the wall clocks below are read in — the speaker's profile zone, or the event's. */
  timezone: string;
  timezoneSource: 'profile' | 'event';
  /** Pre-rendered on the server so the list reads identically before and after hydration. */
  formatWindow: Record<string, string>;
}) {
  const [addState, add] = useActionState(addUnavailabilityAction, IDLE_STATE);
  const [removeState, remove] = useActionState(removeUnavailabilityAction, IDLE_STATE);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>When you cannot present</CardTitle>
        </CardHeader>
        <CardBody>
          <div className={styles.stackTight}>
            <p className={styles.hint}>
              Times are read in <strong>{timezone}</strong>
              {timezoneSource === 'event'
                ? ' — the event timezone, because your profile does not name one yet. '
                : ' — the timezone on your profile. '}
              <a className={styles.checkLink} href={`/portal/${eventSlug}/profile`}>
                {timezoneSource === 'event' ? 'Set your timezone' : 'Change it on your profile'}
              </a>
            </p>

            {windows.length === 0 ? (
              <div className={styles.empty}>
                <div className={styles.emptyTitle}>No blocked time</div>
                <p>
                  Your organizers can schedule you at any time during the event. Add a window below
                  for anything that would not work — a flight, another commitment, a whole day away.
                </p>
              </div>
            ) : (
              windows.map((window) => (
                <div key={window.id} className={styles.rowBetween}>
                  <div className={styles.row}>
                    <CalendarX2 size={16} aria-hidden />
                    <div>
                      <div className={styles.identityName}>{formatWindow[window.id]}</div>
                      {window.note ? (
                        <div className={styles.identityEmail}>{window.note}</div>
                      ) : null}
                    </div>
                  </div>
                  <div className={styles.row}>
                    <Badge tone="warning">Unavailable</Badge>
                    <form action={remove} className={styles.inlineForm}>
                      <input type="hidden" name="eventSlug" value={eventSlug} />
                      <input type="hidden" name="windowId" value={window.id} />
                      <SubmitButton variant="ghost" size="sm">
                        Remove
                      </SubmitButton>
                    </form>
                  </div>
                </div>
              ))
            )}

            <FormNotice state={removeState} />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add a window</CardTitle>
        </CardHeader>
        <CardBody>
          <form action={add} className={styles.stackTight}>
            <input type="hidden" name="eventSlug" value={eventSlug} />
            <div className={styles.fieldGrid}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="unavailable-start-date">
                  From <span className={styles.required}>*</span>
                </label>
                <Input id="unavailable-start-date" name="startDate" type="date" required />
                <FieldError state={addState} field="startDate" />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="unavailable-start-time">
                  From time
                </label>
                <Input id="unavailable-start-time" name="startTime" type="time" />
                <span className={styles.hint}>Leave blank for the start of the day.</span>
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="unavailable-end-date">
                  To
                </label>
                <Input id="unavailable-end-date" name="endDate" type="date" />
                <span className={styles.hint}>Leave blank for the same day.</span>
                <FieldError state={addState} field="endDate" />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="unavailable-end-time">
                  To time
                </label>
                <Input id="unavailable-end-time" name="endTime" type="time" />
                <span className={styles.hint}>Leave blank for the end of the day.</span>
                <FieldError state={addState} field="endTime" />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="unavailable-note">
                Why, briefly
              </label>
              <Textarea
                id="unavailable-note"
                name="note"
                rows={2}
                maxLength={280}
                placeholder="Flight lands 14:00"
              />
              <span className={styles.hint}>
                Optional, and only your organizers see it. A reason is what lets them tell a hard
                clash from one worth a phone call.
              </span>
              <FieldError state={addState} field="note" />
            </div>

            <FormNotice state={addState} />
            <SubmitButton variant="primary">Add window</SubmitButton>
          </form>
        </CardBody>
      </Card>
    </>
  );
}
