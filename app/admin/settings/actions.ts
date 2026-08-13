'use server';

import { revalidatePath } from 'next/cache';
import { requireCapability, type EventContext } from '@/lib/context';
import { invalid, isAppError } from '@/lib/errors';
import { EVENT_BRANDING, type EventBrandingKind } from '@/lib/event-branding';
import { deleteFile } from '@/lib/services/files';
import {
  currentEventContext,
  getEvent,
  updateEvent,
  type UpdateEventInput,
} from '@/lib/services/events';
import * as settings from '@/lib/services/settings';
import type { ActionResult, EntityKind } from './types';

/**
 * Thin, like the rest of `/admin`: resolve the event, check the capability, call the service,
 * translate a thrown `AppError` into something the panel can put under a field. Every rule —
 * what a colour may be, whether a delete is allowed — lives in `lib/services/settings.ts`.
 *
 * The panels post a `Record<string, string>` because one table edits all six taxonomies. The cast
 * on the way into the service is safe in the only sense that matters: each `create`/`update` runs
 * the row through its zod schema before it touches a column.
 */

const PATH = '/admin/settings';

async function manageContext(): Promise<EventContext> {
  const ctx = await currentEventContext();
  requireCapability(ctx, 'event:manage');
  return ctx;
}

async function run<T>(work: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await work();
    revalidatePath(PATH);
    return { ok: true, data };
  } catch (error) {
    if (isAppError(error)) return { ok: false, message: error.message, details: error.details };
    console.error(`settings action failed: ${String(error)}`);
    return { ok: false, message: 'Something went wrong. Try again.' };
  }
}

// ---------------------------------------------------------------------------
// String map in, typed service input out
// ---------------------------------------------------------------------------

type Parser = (raw: string, key: string) => unknown;

const asText: Parser = (raw) => raw;

const asNullableNumber: Parser = (raw, key) => {
  if (raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw invalid('That is not a number', { [key]: 'Enter a number' });
  return value;
};

/** Absent rather than null: the service's default (30 minutes) should win over a blank box. */
const asNumber: Parser = (raw, key) => {
  if (raw.trim() === '') return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw invalid('That is not a number', { [key]: 'Enter a number' });
  return value;
};

const asList: Parser = (raw) =>
  raw
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const PARSERS: Record<EntityKind, Record<string, Parser>> = {
  track: { name: asText, color: asText, description: asText },
  room: { name: asText, capacity: asNullableNumber, floor: asText },
  format: { name: asText, durationMinutes: asNumber, description: asText },
  tag: { name: asText, color: asText },
  persona: { name: asText, description: asText },
  field: { key: asText, label: asText, type: asText, helpText: asText, options: asList },
};

/** Only the keys the caller actually sent, so an update patches rather than blanks. */
function toInput(kind: EntityKind, values: Record<string, string>): Record<string, unknown> {
  const parsers = PARSERS[kind];
  const out: Record<string, unknown> = {};
  for (const [key, parse] of Object.entries(parsers)) {
    const raw = values[key];
    if (raw === undefined) continue;
    const parsed = parse(raw, key);
    if (parsed === undefined) continue;
    out[key] = parsed;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Collection CRUD
// ---------------------------------------------------------------------------

export async function createRowAction(
  kind: EntityKind,
  values: Record<string, string>,
): Promise<ActionResult> {
  return run(async () => {
    const ctx = await manageContext();
    const input = toInput(kind, values);
    switch (kind) {
      case 'track':
        await settings.createTrack(ctx, input as settings.TrackInput);
        break;
      case 'room':
        await settings.createRoom(ctx, input as settings.RoomInput);
        break;
      case 'format':
        await settings.createFormat(ctx, input as settings.FormatInput);
        break;
      case 'tag':
        await settings.createTag(ctx, input as settings.TagInput);
        break;
      case 'persona':
        await settings.createPersona(ctx, input as settings.PersonaInput);
        break;
      case 'field':
        await settings.createFieldEntry(ctx, input as settings.FieldEntryInput);
        break;
    }
    return null;
  });
}

export async function updateRowAction(
  kind: EntityKind,
  id: string,
  values: Record<string, string>,
): Promise<ActionResult> {
  return run(async () => {
    const ctx = await manageContext();
    const patch = toInput(kind, values);
    switch (kind) {
      case 'track':
        await settings.updateTrack(ctx, id, patch as Partial<settings.TrackInput>);
        break;
      case 'room':
        await settings.updateRoom(ctx, id, patch as Partial<settings.RoomInput>);
        break;
      case 'format':
        await settings.updateFormat(ctx, id, patch as Partial<settings.FormatInput>);
        break;
      case 'tag':
        await settings.updateTag(ctx, id, patch as Partial<settings.TagInput>);
        break;
      case 'persona':
        await settings.updatePersona(ctx, id, patch as Partial<settings.PersonaInput>);
        break;
      case 'field':
        await settings.updateFieldEntry(ctx, id, patch as Partial<settings.FieldEntryInput>);
        break;
    }
    return null;
  });
}

/**
 * `reassignTo` is the lossless path and the one the dialog offers first; `force` is the organizer
 * accepting, after being shown the count, that the reference is about to be blanked.
 */
export async function removeRowAction(
  kind: EntityKind,
  id: string,
  options: settings.RemoveOptions = {},
): Promise<ActionResult> {
  return run(async () => {
    const ctx = await manageContext();
    switch (kind) {
      case 'track':
        await settings.removeTrack(ctx, id, options);
        break;
      case 'room':
        await settings.removeRoom(ctx, id, options);
        break;
      case 'format':
        await settings.removeFormat(ctx, id, options);
        break;
      case 'tag':
        await settings.removeTag(ctx, id, options);
        break;
      case 'persona':
        await settings.removePersona(ctx, id, options);
        break;
      case 'field':
        await settings.removeFieldEntry(ctx, id, options);
        break;
    }
    return null;
  });
}

export async function reorderRowsAction(
  kind: EntityKind,
  orderedIds: string[],
): Promise<ActionResult> {
  return run(async () => {
    const ctx = await manageContext();
    switch (kind) {
      case 'track':
        await settings.reorderTracks(ctx, orderedIds);
        break;
      case 'room':
        await settings.reorderRooms(ctx, orderedIds);
        break;
      case 'format':
        await settings.reorderFormats(ctx, orderedIds);
        break;
      case 'persona':
        await settings.reorderPersonas(ctx, orderedIds);
        break;
      default:
        throw invalid('That list has no order to change');
    }
    return null;
  });
}

// ---------------------------------------------------------------------------
// The event itself
// ---------------------------------------------------------------------------

export type EventPatch = UpdateEventInput;

/**
 * `updateEvent` owns every rule now — the trimming, the timezone, the website URL, and the
 * start-before-end check that used to live here and was silently skipped whenever either date was
 * blank. The slug is deliberately absent: it is the public URL of every submitted talk, and the
 * service does not accept a change to it — see `tasks/W10-notes.md`.
 */
export async function updateEventAction(patch: EventPatch): Promise<ActionResult> {
  return run(async () => {
    const ctx = await manageContext();
    await updateEvent(ctx, patch);
    revalidatePath('/admin');
    return null;
  });
}

/**
 * `E-3`. Removing a logo or a banner detaches it and then deletes the bytes: nothing else in the
 * event points at a branding file, so keeping it would only grow the bucket. Uploading is a route
 * handler instead of an action — a Server Action body is capped at 1 MB and a banner is not.
 */
export async function clearEventBrandingAction(kind: EventBrandingKind): Promise<ActionResult> {
  return run(async () => {
    const ctx = await manageContext();
    const current = await getEvent(ctx.eventId);
    const column = EVENT_BRANDING[kind].column;
    const fileId = current[column];
    if (!fileId) return null;

    await updateEvent(ctx, { [column]: null });
    try {
      await deleteFile(ctx, fileId);
    } catch (error) {
      // The event no longer references it, which is the half the organizer can see.
      console.error(`branding cleanup failed: ${String(error)}`);
    }
    revalidatePath('/admin');
    return null;
  });
}

// ---------------------------------------------------------------------------
// Portal appearance — S-11
// ---------------------------------------------------------------------------

/**
 * `S-11`. The speaker portal's own dressing, which had no writer at all: `portal_theme` was read by
 * the portal layout and by the branded email wrapper and inserted only by the seeds, so on an event
 * nobody seeded there was nothing to read. `savePortalAppearance` creates the row on first save.
 *
 * This is not `E-3`. That is `updateEventAction` above, and it dresses the public event pages; this
 * dresses the signed-in portal and the mail sent from it.
 */
export async function savePortalAppearanceAction(
  patch: settings.PortalAppearanceInput,
): Promise<ActionResult<settings.PortalAppearance>> {
  return run(async () => {
    const ctx = await manageContext();
    return settings.savePortalAppearance(ctx, patch);
  });
}

/**
 * Detaches the logo and then deletes the bytes: nothing else points at a portal logo, so keeping it
 * would only grow the bucket. Same reasoning as `clearEventBrandingAction`, and the upload beside it
 * is a route handler for the same reason that one is.
 */
export async function clearPortalLogoAction(): Promise<ActionResult> {
  return run(async () => {
    const ctx = await manageContext();
    const { previousFileId } = await settings.setPortalLogo(ctx, null);
    if (!previousFileId) return null;
    try {
      await deleteFile(ctx, previousFileId);
    } catch (error) {
      // The portal no longer references it, which is the half the organizer can see.
      console.error(`portal logo cleanup failed: ${String(error)}`);
    }
    return null;
  });
}

// ---------------------------------------------------------------------------
// Notifications — the signed-in organizer's own row, not event configuration.
// No `event:manage` check: every organizer, regardless of role, edits their own alert prefs.
// ---------------------------------------------------------------------------

export async function saveMyNotificationPrefsAction(
  patch: settings.NotificationPrefsInput,
): Promise<ActionResult<settings.NotificationPrefs>> {
  return run(async () => {
    const ctx = await currentEventContext();
    return settings.saveNotificationPrefs(ctx.actor.userId, patch);
  });
}

export async function saveMyNotificationDeliveryPrefsAction(
  patch: settings.DeliveryPreferenceInput,
): Promise<ActionResult<settings.NotificationPrefs>> {
  return run(async () => {
    const ctx = await currentEventContext();
    return settings.saveNotificationDeliveryPrefs(ctx.actor.userId, ctx.eventId, patch);
  });
}
