'use server';

import { revalidatePath } from 'next/cache';
import { requireCurrentActor } from '@/lib/auth';
import { isAppError } from '@/lib/errors';
import {
  saveAccountProfile,
  type AccountNameInput,
  type AccountProfile,
} from '@/lib/services/account';

export type AccountActionResult =
  | { ok: true; data: AccountProfile }
  | { ok: false; message: string; details?: Record<string, string> };

export async function saveAccountAction(input: AccountNameInput): Promise<AccountActionResult> {
  try {
    const actor = await requireCurrentActor();
    const profile = await saveAccountProfile(actor.userId, input);
    revalidatePath('/organizer', 'layout');
    return { ok: true, data: profile };
  } catch (error) {
    if (isAppError(error)) {
      return { ok: false, message: error.message, details: error.details };
    }
    console.error(`account settings action failed: ${String(error)}`);
    return { ok: false, message: 'Something went wrong. Try again.' };
  }
}
