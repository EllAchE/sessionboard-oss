'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isAppError } from '@/lib/errors';
import { cloneEvent } from '@/lib/services/event-clone';
import { EVENT_COOKIE, currentEventContext } from '@/lib/services/events';

/**
 * `AD-1`. Thin, like the rest of `/organizer`: resolve the source event, hand the input to the
 * service, translate a thrown `AppError` back into something a field can show. Every rule — who
 * may clone, what comes across, what a window may be — lives in `lib/services/event-clone.ts`.
 *
 * The capability check is on the *source* event, which is what `currentEventContext` resolves and
 * what `cloneEvent` requires `event:manage` against. Creating the copy is then unremarkable: the
 * caller becomes its owner and organizer, exactly as on the cold-start create path.
 */

export type DuplicateEventFailure = {
  ok: false;
  message: string;
  details?: Record<string, string>;
};

export async function duplicateEventAction(
  values: Record<string, string>,
): Promise<DuplicateEventFailure> {
  const ctx = await currentEventContext();

  let created;
  try {
    created = await cloneEvent(ctx, {
      name: values.name ?? '',
      slug: values.slug || null,
      timezone: values.timezone || null,
      startsAt: values.startsAt ?? '',
      endsAt: values.endsAt ?? '',
    });
  } catch (error) {
    if (isAppError(error)) return { ok: false, message: error.message, details: error.details };
    console.error(`duplicate event failed: ${String(error)}`);
    return { ok: false, message: 'Something went wrong. Try again.' };
  }

  // Switch to the copy: somebody who just duplicated an event wants to be in the copy, not still
  // looking at the original and wondering whether it worked.
  const store = await cookies();
  store.set(EVENT_COOKIE, created.eventId, { httpOnly: true, sameSite: 'lax', path: '/' });
  redirect('/organizer/settings?duplicated=1');
}
