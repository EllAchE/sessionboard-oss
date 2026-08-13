'use server';

import { isAppError } from '../../../../lib/errors';
import * as review from '../../../../lib/services/review';
import { decideContext } from '../context';
import type { ActionResult } from '../types';
import type { ImportPreview } from './contract';

/**
 * The preview runs the same `parseSubmissionImport` the import runs, on the server, rather than a
 * second parser in the browser. A preview that disagrees with the import is worse than no preview,
 * and the parser cannot cross the bundle boundary — `lib/services/review.ts` opens a database
 * connection at import.
 */
export async function previewImportAction(csv: string): Promise<ActionResult<ImportPreview>> {
  try {
    await decideContext();
    const parsed = review.parseSubmissionImport(csv);
    return { ok: true, data: { headers: parsed.headers, rows: parsed.rows, errors: parsed.errors } };
  } catch (error) {
    if (isAppError(error)) return { ok: false, message: error.message, details: error.details };
    console.error(`import preview failed: ${String(error)}`);
    return { ok: false, message: 'Something went wrong. Try again.' };
  }
}
