'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireCurrentActor, signOut } from '@/lib/auth';
import { forbidden } from '@/lib/errors';
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

export async function createEventAction(formData: FormData): Promise<void> {
  const actor = await requireCurrentActor();
  const created = await createEvent(actor.userId, {
    name: String(formData.get('name') ?? ''),
    slug: String(formData.get('slug') ?? '') || null,
    tagline: String(formData.get('tagline') ?? '') || null,
    timezone: String(formData.get('timezone') ?? '') || null,
    startsOn: String(formData.get('startsOn') ?? '') || null,
    endsOn: String(formData.get('endsOn') ?? '') || null,
  });

  const store = await cookies();
  store.set(EVENT_COOKIE, created.id, { httpOnly: true, sameSite: 'lax', path: '/' });
  redirect('/admin');
}

export async function signOutAction(): Promise<void> {
  await signOut();
  redirect('/signin');
}
