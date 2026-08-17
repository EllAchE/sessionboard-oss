'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * `EMB-09`–`EMB-11`. The personal schedule is `localStorage`, not an account: an attendee reading an
 * embedded widget on somebody else's website has no reason to sign in, and a starred talk that
 * survives a reload is the whole of what the requirement asks for.
 *
 * It lives here rather than inside the itinerary widget because the agenda grid stars into the same
 * set. One key means the two views need no synchronisation to agree — a talk starred on the grid is
 * already in the schedule by the time the attendee opens it.
 */

const KEY_PREFIX = 'cicero-my-schedule:';

/**
 * `storage` only fires in the *other* tabs, so two widgets rendered on one page would drift apart
 * without a same-tab signal of our own.
 */
const CHANGE_EVENT = 'cicero:my-schedule';

export function scheduleStorageKey(slug: string): string {
  return `${KEY_PREFIX}${slug}`;
}

/** A corrupt, absent or blocked store just means an empty schedule, never a broken widget. */
export function parseSchedule(raw: string | null): string[] {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === 'string');
  } catch {
    return [];
  }
}

export function toggleEntry(current: readonly string[], id: string): string[] {
  return current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id];
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((entry, index) => entry === b[index]);
}

export type MySchedule = {
  starred: string[];
  isStarred: (id: string) => boolean;
  toggle: (id: string) => void;
  count: number;
};

export function useMySchedule(slug: string): MySchedule {
  const key = scheduleStorageKey(slug);
  const [starred, setStarred] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    /*
      Returning `current` unchanged when the stored value already matches makes React bail out of the
      render, which is what stops a load → persist → broadcast → load cycle between two widgets.
    */
    const load = () =>
      setStarred((current) => {
        let raw: string | null = null;
        try {
          raw = window.localStorage.getItem(key);
        } catch {
          return current;
        }
        const next = parseSchedule(raw);
        return sameOrder(current, next) ? current : next;
      });

    load();
    setHydrated(true);

    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === key) load();
    };
    const onLocalChange = (event: Event) => {
      if ((event as CustomEvent<string>).detail === key) load();
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener(CHANGE_EVENT, onLocalChange);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(CHANGE_EVENT, onLocalChange);
    };
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    const serialised = JSON.stringify(starred);
    try {
      // Hydration settles the state to whatever was already stored; writing that back would
      // broadcast a change that never happened.
      if (window.localStorage.getItem(key) === serialised) return;
      window.localStorage.setItem(key, serialised);
    } catch {
      /* Private-mode storage refuses writes; the selection still works for this page view. */
    }
    window.dispatchEvent(new CustomEvent<string>(CHANGE_EVENT, { detail: key }));
  }, [hydrated, key, starred]);

  const toggle = useCallback((id: string) => {
    setStarred((current) => toggleEntry(current, id));
  }, []);

  const isStarred = useCallback((id: string) => starred.includes(id), [starred]);

  return useMemo(
    () => ({ starred, isStarred, toggle, count: starred.length }),
    [starred, isStarred, toggle],
  );
}

/** The accessible name has to carry the session, since the grid draws the control as a bare star. */
export function starActionLabel(title: string, isStarred: boolean): string {
  return isStarred ? `Remove ${title} from my schedule` : `Add ${title} to my schedule`;
}
