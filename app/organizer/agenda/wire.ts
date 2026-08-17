import type { ScheduleEntry, SpeakerUnavailability } from '@/lib/services/schedule';

/**
 * The half of the agenda read model a browser is allowed to have. `data.ts` opens a database
 * connection at import, so a client component importing these from there drags `pg` — and with it
 * `net` and `tls` — into the bundle and the build fails.
 */

export type NamedRoom = { id: string; name: string; capacity: number | null; floor: string | null };
export type NamedTrack = { id: string; name: string; color: string | null };
export type NamedFormat = { id: string; name: string; durationMinutes: number };

/**
 * Dates do not survive the server→client boundary as `Date`, so the board receives ISO strings and
 * rehydrates.
 */
export type WireEntry = Omit<ScheduleEntry, 'startsAt' | 'endsAt'> & {
  startsAt: string | null;
  endsAt: string | null;
};

export function toWire(entries: ScheduleEntry[]): WireEntry[] {
  return entries.map((entry) => ({
    ...entry,
    startsAt: entry.startsAt ? entry.startsAt.toISOString() : null,
    endsAt: entry.endsAt ? entry.endsAt.toISOString() : null,
  }));
}

export function fromWire(entries: WireEntry[]): ScheduleEntry[] {
  return entries.map((entry) => ({
    ...entry,
    startsAt: entry.startsAt ? new Date(entry.startsAt) : null,
    endsAt: entry.endsAt ? new Date(entry.endsAt) : null,
  }));
}

/** `AD-2`. Same rehydration, same reason. */
export type WireUnavailability = Omit<SpeakerUnavailability, 'startsAt' | 'endsAt'> & {
  startsAt: string;
  endsAt: string;
};

export function unavailabilityToWire(windows: SpeakerUnavailability[]): WireUnavailability[] {
  return windows.map((window) => ({
    ...window,
    startsAt: window.startsAt.toISOString(),
    endsAt: window.endsAt.toISOString(),
  }));
}

export function unavailabilityFromWire(windows: WireUnavailability[]): SpeakerUnavailability[] {
  return windows.map((window) => ({
    ...window,
    startsAt: new Date(window.startsAt),
    endsAt: new Date(window.endsAt),
  }));
}
