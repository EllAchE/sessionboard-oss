'use server';

import { revalidatePath } from 'next/cache';
import * as accelevents from '@/lib/accelevents';
import * as airtable from '@/lib/airtable';
import { isAppError } from '@/lib/errors';
import { issueApiKey, revokeApiKey } from '../../api/v1/_lib/auth';
import { integrationContext } from './context';
import type { ActionResult, TestResult } from './types';

/**
 * Thin by construction, like the rest of `/admin`: resolve the event, check the capability, call
 * the integration, translate a thrown `AppError`. Every rule lives under `lib/accelevents/**` and
 * `lib/airtable/**` so this screen and any future caller cannot drift.
 */

const PATH = '/admin/integrations';

async function run<T>(work: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await work();
    revalidatePath(PATH);
    return { ok: true, data };
  } catch (error) {
    if (isAppError(error)) return { ok: false, message: error.message, details: error.details };
    console.error(`integration action failed: ${String(error)}`);
    return { ok: false, message: 'Something went wrong. Try again.' };
  }
}

/**
 * The plaintext is in this response and nowhere else — `issueApiKey` stores only a hash, so a lost
 * key is reissued, never recovered.
 */
export async function createApiKeyAction(
  name: string,
): Promise<ActionResult<{ id: string; name: string; prefix: string; plaintext: string }>> {
  return run(async () => {
    const ctx = await integrationContext();
    const trimmed = name.trim();
    const issued = await issueApiKey(ctx.eventId, trimmed.length > 0 ? trimmed : 'Untitled key');
    return {
      id: issued.id,
      name: issued.name,
      prefix: issued.prefix,
      plaintext: issued.plaintext,
    };
  });
}

export async function revokeApiKeyAction(keyId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await integrationContext();
    await revokeApiKey(ctx.eventId, keyId);
    return null;
  });
}

export async function pushSpeakersAction(participantIds?: string[]): Promise<
  ActionResult<{
    created: number;
    alreadyThere: number;
    skipped: number;
    failed: number;
    authHeaderUsed: string | null;
  }>
> {
  return run(async () => {
    const ctx = await integrationContext();
    const summary = await accelevents.pushAcceptedSpeakers(ctx.eventId, {
      participantIds,
    });
    return {
      created: summary.created,
      alreadyThere: summary.alreadyThere,
      skipped: summary.skipped,
      failed: summary.failed,
      authHeaderUsed: summary.authHeaderUsed,
    };
  });
}

export async function testAccelEventsAction(): Promise<ActionResult<TestResult>> {
  return run(async () => {
    await integrationContext();
    const result = await accelevents.testConnection();
    return {
      ok: result.ok,
      message: result.message,
      extra: result.authHeaderUsed ? `Accepted the \`${result.authHeaderUsed}\` header` : null,
    };
  });
}

export async function testAirtableAction(): Promise<ActionResult<TestResult>> {
  return run(async () => {
    await integrationContext();
    const result = await airtable.testConnection();
    return {
      ok: result.ok,
      message: result.message,
      extra: result.tables?.length ? `Tables in this base: ${result.tables.join(', ')}` : null,
    };
  });
}

/**
 * One bounded run. `backfill` is resumable, so `incomplete` is not an error — it is the signal to
 * press the button again, which is cheaper to explain than a progress bar over a 5 rps ceiling.
 */
export async function syncAirtableAction(options: {
  types?: airtable.AirtableEntityType[];
  force?: boolean;
}): Promise<ActionResult<airtable.SyncProgress>> {
  return run(async () => {
    const ctx = await integrationContext();
    return airtable.backfill(ctx.eventId, {
      types: options.types,
      force: options.force,
    });
  });
}
