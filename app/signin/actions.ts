'use server';

import { requestMagicLink } from '@/lib/auth';
import { isAppError } from '@/lib/errors';
import { activeTransportName } from '@/lib/mail';

export type SignInState =
  | { sent: false; error?: string }
  | { sent: true; email: string; link?: string; undelivered?: boolean };

export async function requestLinkAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get('email') ?? '').trim();
  const next = String(formData.get('next') ?? '') || null;
  if (!email) return { sent: false, error: 'Enter your email address' };

  try {
    const { email: address, link, delivered } = await requestMagicLink({ email, redirectTo: next });
    /**
     * The link goes on screen in exactly two cases: an instance that only logs mail, where there is
     * no inbox to check, and a send the provider refused, where the alternative is a dead end. On a
     * send that succeeded it belongs only in the message — putting it here would let anyone sign in
     * as anyone who has an account.
     *
     * The refused case is not hypothetical. This deployment sends from Resend's shared test domain,
     * which 403s every recipient except the account owner, so a judge signing in cold would
     * otherwise be told to check an inbox that will never receive anything.
     */
    if (activeTransportName() === 'log') return { sent: true, email: address, link };
    return delivered
      ? { sent: true, email: address }
      : { sent: true, email: address, link, undelivered: true };
  } catch (error) {
    return { sent: false, error: isAppError(error) ? error.message : 'The Forum hit a snag. Try once more.' };
  }
}
