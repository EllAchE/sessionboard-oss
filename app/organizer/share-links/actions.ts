'use server';

import { revalidatePath } from 'next/cache';
import { appUrl } from '@/lib/env';
import { isAppError } from '@/lib/errors';
import { issueShareLink, revokeShareLink } from '@/lib/services/share-links';
import { shareLinkContext } from './context';
import type { ActionResult, IssuedShareLinkRow } from './types';

const PATH = '/organizer/share-links';

async function run<T>(work: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await work();
    revalidatePath(PATH);
    return { ok: true, data };
  } catch (error) {
    if (isAppError(error)) return { ok: false, message: error.message, details: error.details };
    console.error(`share link action failed: ${String(error)}`);
    return { ok: false, message: 'Something went wrong. Try again.' };
  }
}

/**
 * The returned `url` contains the plaintext token, and this response is the only place it will ever
 * appear. It is not persisted, not logged, and not recoverable from the row the table then lists —
 * the database holds a SHA-256 of it and an 8-character prefix.
 */
export async function createShareLinkAction(
  label: string,
  view: string,
  expiresInDays: number,
): Promise<ActionResult<IssuedShareLinkRow>> {
  return run(async () => {
    const ctx = await shareLinkContext();
    const issued = await issueShareLink(ctx, { label, view, expiresInDays });
    return {
      id: issued.id,
      label: issued.label,
      url: `${appUrl()}/s/${issued.token}`,
      expiresAt: issued.expiresAt.toISOString(),
    };
  });
}

export async function revokeShareLinkAction(linkId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await shareLinkContext();
    await revokeShareLink(ctx.eventId, linkId);
    return null;
  });
}
