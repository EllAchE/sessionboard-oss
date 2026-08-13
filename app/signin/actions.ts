'use server';

import { magicLinkMayBeShown, requestMagicLink } from '@/lib/auth';
import { isAppError } from '@/lib/errors';
import type { DeliveryState } from './copy';

export type SignInState =
  | { sent: false; error?: string }
  | { sent: true; email: string; delivery: DeliveryState; link?: string };

export async function requestLinkAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get('email') ?? '').trim();
  const next = String(formData.get('next') ?? '') || null;
  if (!email) return { sent: false, error: 'Enter your email address' };

  try {
    const { email: address, link } = await requestMagicLink({ email, redirectTo: next });
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
