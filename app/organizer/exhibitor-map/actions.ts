'use server';

import { revalidatePath } from 'next/cache';
import { isAppError } from '@/lib/errors';
import { exhibitorMapEmbedPath } from '@/lib/exhibitor-map';
import { removeExhibitorMap } from '@/lib/services/exhibitor-map';
import { getEvent } from '@/lib/services/events';
import { exhibitorMapContext } from './context';

export type ExhibitorMapActionResult = { ok: true } | { ok: false; message: string };

export async function removeExhibitorMapAction(): Promise<ExhibitorMapActionResult> {
  try {
    const ctx = await exhibitorMapContext();
    const owner = await getEvent(ctx.eventId);
    await removeExhibitorMap(ctx);
    revalidatePath('/organizer/exhibitor-map');
    revalidatePath('/organizer/embeds');
    revalidatePath(exhibitorMapEmbedPath(owner.slug));
    return { ok: true };
  } catch (error) {
    if (isAppError(error)) return { ok: false, message: error.message };
    console.error(`exhibitor map removal failed: ${String(error)}`);
    return { ok: false, message: 'Something went wrong. Try again.' };
  }
}
