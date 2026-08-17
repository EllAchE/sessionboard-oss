'use server';

import { headers } from 'next/headers';
import { magicLinkMayBeShown, requestMagicLink } from '@/lib/auth';
import { isAppError } from '@/lib/errors';
import { getEventBySlug } from '@/lib/services/events';
import type { DeliveryState } from './copy';
import { localAuthOrigin } from './redirect';

export type SignInState =
  | { sent: false; error?: string }
  | { sent: true; email: string; delivery: DeliveryState; link?: string };

export async function requestLinkAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get('email') ?? '').trim();
  const next = String(formData.get('next') ?? '') || null;
  if (!email) return { sent: false, error: 'Enter your email address' };

  try {
    const { email: address, link } = await requestMagicLink({
      email,
      eventId: await eventIdForSlug(String(formData.get('event') ?? '')),
      redirectTo: next,
      developmentOrigin: localAuthOrigin(await headers()),
    });
    /**
     * A link on this page is a session for whoever was typed into the box, so exactly one predicate
     * decides it — `lib/demo-access.ts`, which states the boundary in full. It says yes for an
     * instance that delivers nothing to anyone, and — only where the deployment has explicitly
     * enabled it — for a seeded demo identity at a domain no mailbox can exist behind.
     *
     * Note what is deliberately absent: a failed send does not qualify. Revealing the link whenever
     * the provider says no would hand an attacker the account of any real user, on any address a
     * provider happens to reject, throttle or greylist.
     */
    const visible = await magicLinkMayBeShown(address);
    if (!visible) return { sent: true, email: address, delivery: 'email' };
    return {
      sent: true,
      email: address,
      link,
      delivery: visible === 'seeded-demo-account' ? 'demo' : 'logged',
    };
  } catch (error) {
    return { sent: false, error: isAppError(error) ? error.message : 'Something went wrong. Try again.' };
  }
}

/**
 * A sign-in URL may name the event it is for — `/signin?email=…&next=/review&event=demo` — and the
 * slug rides through to `magic_token.event_id`, which `consumeMagicLink` adopts onto the session.
 * Without it the three demo tours all sign in with no event named, and each surface then guesses
 * from a different rule: the organizer shell takes the soonest upcoming event, the reviewer queue
 * the next one to happen, the portal index asks. Four seeded events, three different answers.
 *
 * An unknown slug is dropped rather than refused. Nothing here grants anything — `adoptTokenEvent`
 * rechecks membership before it writes the cookie, so the worst a hand-typed slug can do is name an
 * event its recipient does not belong to, which is then ignored. Failing the sign-in over it would
 * turn a stale link into a locked door.
 */
async function eventIdForSlug(slug: string): Promise<string | null> {
  if (!slug.trim()) return null;
  try {
    return (await getEventBySlug(slug.trim())).id;
  } catch {
    return null;
  }
}
