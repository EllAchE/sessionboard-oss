'use server';

import { requestMagicLink } from '@/lib/auth';
import { isAppError } from '@/lib/errors';
import { activeTransportName } from '@/lib/mail';

export type SignInState =
  | { sent: false; error?: string }
  | { sent: true; email: string; link?: string };

export async function requestLinkAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get('email') ?? '').trim();
  const next = String(formData.get('next') ?? '') || null;
  if (!email) return { sent: false, error: 'Enter your email address' };

  try {
    const { email: delivered, link } = await requestMagicLink({ email, redirectTo: next });
    /**
     * On an instance that only logs mail there is no inbox to check, so the link is put on screen
     * rather than stranding whoever asked for it. Never on an instance with a real transport: there
     * the link belongs only in the message, and putting it here would let anyone sign in as anyone.
     */
    return activeTransportName() === 'log'
      ? { sent: true, email: delivered, link }
      : { sent: true, email: delivered };
  } catch (error) {
    return { sent: false, error: isAppError(error) ? error.message : 'Something went wrong. Try again.' };
  }
}
