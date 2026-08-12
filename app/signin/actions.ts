'use server';

import { requestMagicLink } from '@/lib/auth';
import { isAppError } from '@/lib/errors';

export type SignInState = { sent: false; error?: string } | { sent: true; email: string };

export async function requestLinkAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get('email') ?? '').trim();
  const next = String(formData.get('next') ?? '') || null;
  if (!email) return { sent: false, error: 'Enter your email address' };

  try {
    const { email: delivered } = await requestMagicLink({ email, redirectTo: next });
    return { sent: true, email: delivered };
  } catch (error) {
    return { sent: false, error: isAppError(error) ? error.message : 'Something went wrong. Try again.' };
  }
}
