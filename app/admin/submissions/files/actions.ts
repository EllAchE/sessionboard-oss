'use server';

import { revalidatePath } from 'next/cache';
import { isAppError } from '../../../../lib/errors';
import {
  chaseDeliverables,
  restoreContentRevision,
  setSessionContentStatus,
  updateSessionContent,
  updateSpeakerContent,
  type ChaseResult,
  type ContentApprovalStatus,
  type ContentEntityKind,
} from '../../../../lib/services/content';
import { addFileComment } from '../../../../lib/services/files';
import { decideContext, reviewContext } from '../context';
import type { ActionResult } from '../types';

/**
 * The organizer's half of `CNT-05` and `CNT-11`. Thin by construction: resolve the context, call the
 * service, translate a thrown `AppError`.
 */

async function run<T>(work: () => Promise<T>, path: string): Promise<ActionResult<T>> {
  try {
    const data = await work();
    revalidatePath(path);
    return { ok: true, data };
  } catch (error) {
    if (isAppError(error)) return { ok: false, message: error.message, details: error.details };
    console.error(`files action failed: ${String(error)}`);
    return { ok: false, message: 'The Forum hit a snag. Try once more.' };
  }
}

export async function postFileCommentAction(
  fileId: string,
  body: string,
): Promise<ActionResult<null>> {
  return run(async () => {
    const ctx = await reviewContext();
    await addFileComment(ctx, fileId, body);
    return null;
  }, `/admin/submissions/files/detail/${fileId}`);
}

export async function chaseDeliverablesAction(
  assignmentIds: string[],
): Promise<ActionResult<ChaseResult>> {
  return run(async () => {
    const ctx = await decideContext();
    return chaseDeliverables(ctx, assignmentIds);
  }, '/admin/submissions/files/deliverables');
}

export async function restoreRevisionAction(revisionId: string): Promise<ActionResult<null>> {
  return run(async () => {
    const ctx = await decideContext();
    await restoreContentRevision(ctx, revisionId);
    return null;
  }, '/admin/submissions/files/history');
}

export async function setContentStatusAction(
  submissionId: string,
  status: ContentApprovalStatus,
): Promise<ActionResult<null>> {
  return run(async () => {
    const ctx = await decideContext();
    await setSessionContentStatus(ctx, submissionId, status);
    return null;
  }, '/admin/submissions/files/history');
}

export async function saveContentAction(
  kind: ContentEntityKind,
  entityId: string,
  fields: Record<string, string>,
): Promise<ActionResult<null>> {
  return run(async () => {
    const ctx = await decideContext();
    if (kind === 'session') {
      await updateSessionContent(ctx, entityId, {
        title: fields.title ?? '',
        descriptionMarkdown: fields.descriptionMarkdown ?? '',
        level: fields.level ?? '',
      });
    } else {
      await updateSpeakerContent(ctx, entityId, {
        displayName: fields.displayName ?? '',
        jobTitle: fields.jobTitle ?? '',
        company: fields.company ?? '',
        bioMarkdown: fields.bioMarkdown ?? '',
      });
    }
    return null;
  }, '/admin/submissions/files/history');
}
