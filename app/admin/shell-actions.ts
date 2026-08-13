'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireCurrentActor, signOut } from '@/lib/auth';
import { forbidden, isAppError } from '@/lib/errors';
import { EVENT_COOKIE, createEvent, listEventsForUser } from '@/lib/services/events';

/** Membership is re-checked here; the switcher's option list is a convenience, not the boundary. */
export async function switchEvent(eventId: string): Promise<void> {
  const actor = await requireCurrentActor();
  const events = await listEventsForUser(actor.userId);
  if (!events.some((candidate) => candidate.id === eventId)) {
    throw forbidden('You do not have a role on that event');
  }

  const store = await cookies();
  store.set(EVENT_COOKIE, eventId, { httpOnly: true, sameSite: 'lax', path: '/' });
  redirect('/admin');
}

export type CreateEventFailure = {
  ok: false;
  message: string;
  details?: Record<string, string>;
};

/**
 * `E-1`, `E-2`. Every rule lives in `createEvent`; this shapes the form into its input and turns a
 * thrown `AppError` back into something a field can show. It used to throw straight through to the
 * error boundary, and this is the one screen a judge reaches before they have anything else, so it
 * has to fail politely. On success it never returns — `redirect` throws.
 */
export async function createEventAction(
  values: Record<string, string>,
): Promise<CreateEventFailure> {
  const actor = await requireCurrentActor();

  let created;
  try {
    created = await createEvent(actor.userId, {
      name: values.name ?? '',
      slug: values.slug || null,
      timezone: values.timezone || null,
      startsAt: values.startsAt ?? '',
      endsAt: values.endsAt ?? '',
      tagline: values.tagline ?? '',
      eventType: values.eventType ?? '',
      websiteUrl: values.websiteUrl ?? '',
      venueName: values.venueName ?? '',
    });
  } catch (error) {
    if (isAppError(error)) return { ok: false, message: error.message, details: error.details };
    console.error(`create event failed: ${String(error)}`);
    return { ok: false, message: 'Something went wrong. Try again.' };
  }

  const store = await cookies();
  store.set(EVENT_COOKIE, created.id, { httpOnly: true, sameSite: 'lax', path: '/' });
  redirect('/admin');
}

export async function signOutAction(): Promise<void> {
  await signOut();
  redirect('/signin');
}
