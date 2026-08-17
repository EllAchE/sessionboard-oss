'use client';

import { useTransition } from 'react';
import { Select } from '@/components/ui';
import type { EventSummary } from '@/lib/services/events';
import { switchEvent } from './shell-actions';

export function EventSwitcher({
  events,
  currentEventId,
}: {
  events: EventSummary[];
  currentEventId: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Select
      selectSize="sm"
      aria-label="Current event"
      value={currentEventId}
      disabled={pending}
      onChange={(e) => {
        const next = e.currentTarget.value;
        if (next === '__new') {
          window.location.href = '/events/new';
          return;
        }
        // `AD-1`. The switcher is where somebody reaches when they want another event, and next
        // year's edition is far more often a copy of this one than a blank.
        if (next === '__duplicate') {
          window.location.href = '/organizer/duplicate';
          return;
        }
        startTransition(() => {
          void switchEvent(next);
        });
      }}
    >
      {events.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name}
        </option>
      ))}
      <option value="__new">+ New event…</option>
      <option value="__duplicate">⧉ Duplicate this event…</option>
    </Select>
  );
}
