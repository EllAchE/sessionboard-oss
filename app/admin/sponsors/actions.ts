'use server';

import { revalidatePath } from 'next/cache';
import { isAppError } from '@/lib/errors';
import { deleteFile } from '@/lib/services/files';
import {
  createSponsor,
  getSponsor,
  removeSponsor,
  reorderSponsors,
  updateSponsor,
  type SponsorInput,
  type SponsorKind,
  type SponsorRecord,
} from '@/lib/services/sponsors';
import { manageSponsorsContext } from './context';
import type { ActionResult } from './types';

/**
 * `E-7`. Thin, like the rest of `/admin`: resolve the event, check the capability, call the service,
 * translate a thrown `AppError` into something the board can put under a field. Every rule — what a
 * website may be, whether a name is free — lives in `lib/services/sponsors.ts`.
 */

const PATH = '/admin/sponsors';

async function run<T>(work: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await work();
    revalidatePath(PATH);
    return { ok: true, data };
  } catch (error) {
    if (isAppError(error)) return { ok: false, message: error.message, details: error.details };
    console.error(`sponsors action failed: ${String(error)}`);
    return { ok: false, message: 'Something went wrong. Try again.' };
  }
}

export async function createSponsorAction(
  input: SponsorInput,
): Promise<ActionResult<SponsorRecord>> {
  return run(async () => createSponsor(await manageSponsorsContext(), input));
}

export async function updateSponsorAction(
  sponsorId: string,
  patch: Partial<SponsorInput>,
): Promise<ActionResult<SponsorRecord>> {
  return run(async () => updateSponsor(await manageSponsorsContext(), sponsorId, patch));
}

/**
 * The logo is deleted after the row, and only if the row went. Doing it the other way round would
 * leave a sponsor pointing at bytes that no longer exist whenever the delete was refused.
 *
 * The cleanup itself is best-effort and never fails the action, matching `clearEventBrandingAction`:
 * a stranded file costs storage, while a refused delete costs the organizer the thing they asked
 * for.
 */
export async function removeSponsorAction(sponsorId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await manageSponsorsContext();
    const existing = await getSponsor(ctx, sponsorId);
    await removeSponsor(ctx, sponsorId);
    if (existing.logoFileId) {
      try {
        await deleteFile(ctx, existing.logoFileId);
      } catch (error) {
        console.error(`sponsor logo cleanup failed: ${String(error)}`);
      }
    }
    return null;
  });
}

/** Clears the slot and drops the bytes. Same order and same best-effort cleanup as the delete. */
export async function clearSponsorLogoAction(sponsorId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await manageSponsorsContext();
    const before = await getSponsor(ctx, sponsorId);
    if (!before.logoFileId) return null;
    await updateSponsor(ctx, sponsorId, { logoFileId: null });
    try {
      await deleteFile(ctx, before.logoFileId);
    } catch (error) {
      console.error(`sponsor logo cleanup failed: ${String(error)}`);
    }
    return null;
  });
}

export async function reorderSponsorsAction(
  kind: SponsorKind,
  orderedIds: string[],
): Promise<ActionResult> {
  return run(async () => {
    await reorderSponsors(await manageSponsorsContext(), kind, orderedIds);
    return null;
  });
}
