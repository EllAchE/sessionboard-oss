import type { EventContext } from '@/lib/context';
import { forbidden } from '@/lib/errors';
import {
  listFileComments,
  listFileVersions,
  type DeliverableComment,
  type FileVersion,
} from '@/lib/services/files';
import type { Participant } from '@/lib/services/portal';
import { listPortalTasks, type PortalTask } from '@/lib/services/tasks';

export type PortalDeliverable = {
  lineageId: string;
  current: FileVersion;
  versions: FileVersion[];
  comments: DeliverableComment[];
  task: PortalTask | null;
  isHeadshot: boolean;
};

/**
 * A speaker reaches a deliverable through their own task list or their own headshot, and any id in
 * the lineage resolves the same page — otherwise a link to version 1, sent before the replacement,
 * would 403 the person who owns the file.
 */
export async function myDeliverable(
  ctx: EventContext,
  me: Participant,
  fileId: string,
): Promise<PortalDeliverable> {
  const versions = await listFileVersions(ctx.eventId, fileId);
  const ids = versions.map((entry) => entry.id);

  const tasks = await listPortalTasks(ctx.eventId, me.id);
  const task = tasks.find((entry) => entry.files.some((record) => ids.includes(record.id))) ?? null;
  const isHeadshot = Boolean(me.headshotFileId && ids.includes(me.headshotFileId));
  if (!task && !isHeadshot) throw forbidden('That record is not one of yours');

  return {
    lineageId: versions[0]?.id ?? fileId,
    current: versions[versions.length - 1],
    versions,
    comments: await listFileComments(ctx.eventId, fileId),
    task,
    isHeadshot,
  };
}
