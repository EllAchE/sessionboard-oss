'use server';

import { redirect } from 'next/navigation';
import { signOut, stopImpersonation } from '@/lib/auth';

/**
 * `S-10`. The organizer's own session is restored by `stopImpersonation`; this wrapper exists only
 * so the banner's "Return to organizer" can be a real form submission rather than a link that leaves
 * the impersonated cookie in place.
 */
export async function stopImpersonationAction(): Promise<void> {
  await stopImpersonation();
  redirect('/organizer');
}

export async function portalSignOutAction(): Promise<void> {
  await signOut();
  redirect('/signin');
}
