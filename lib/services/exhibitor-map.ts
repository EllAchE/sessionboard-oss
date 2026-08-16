import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { event, eventExhibitorMap, file } from '@/db/schema';
import type { EventContext } from '@/lib/context';
import { requireCapability } from '@/lib/context';
import {
  EXHIBITOR_MAP_UPLOAD,
  exhibitorMapFilePath,
  hasPdfSignature,
} from '@/lib/exhibitor-map';
import { invalid, notFound } from '@/lib/errors';
import { getStorage } from '@/lib/storage';
import {
  adhocSpec,
  deleteFile,
  getFileRecord,
  storeFile,
  validateUpload,
  type FileRecord,
  type UploadInput,
} from './files';

export type ExhibitorMapRecord = {
  eventId: string;
  fileId: string;
  createdAt: Date;
  updatedAt: Date;
  file: FileRecord;
};

/** The organizer read model. A dangling or cross-event file fails closed through `getFileRecord`. */
export async function getExhibitorMap(eventId: string): Promise<ExhibitorMapRecord | null> {
  const slot = await getDb().query.eventExhibitorMap.findFirst({
    where: eq(eventExhibitorMap.eventId, eventId),
  });
  if (!slot) return null;
  const record = await getFileRecord(eventId, slot.fileId);
  return { ...slot, file: record };
}

export function validateExhibitorMapUpload(input: UploadInput): void {
  validateUpload(
    adhocSpec(EXHIBITOR_MAP_UPLOAD.label, {
      acceptedTypes: [...EXHIBITOR_MAP_UPLOAD.acceptedTypes],
      maxSizeMb: EXHIBITOR_MAP_UPLOAD.maxSizeMb,
      allowMultiple: false,
    }),
    input,
  );
  if (!input.filename.toLowerCase().endsWith('.pdf')) {
    throw invalid('Exhibitor map accepts a .pdf file');
  }
  if (!hasPdfSignature(input.bytes)) {
    throw invalid('That file is not a readable PDF');
  }
}

/**
 * Uploading is publication for this deliberately basic feature. The slot changes before old bytes
 * are cleaned up, so a cleanup failure can leave an unreachable object but never a broken embed.
 */
export async function uploadExhibitorMap(
  ctx: EventContext,
  input: UploadInput,
): Promise<ExhibitorMapRecord> {
  requireCapability(ctx, 'event:manage');
  validateExhibitorMapUpload(input);

  const previous = await getExhibitorMap(ctx.eventId);
  const stored = await storeFile(ctx, input);
  try {
    await getDb()
      .insert(eventExhibitorMap)
      .values({ eventId: ctx.eventId, fileId: stored.id })
      .onConflictDoUpdate({
        target: eventExhibitorMap.eventId,
        set: { fileId: stored.id, updatedAt: new Date() },
      });
  } catch (error) {
    await deleteFile(ctx, stored.id).catch((cleanupError) =>
      console.error(`exhibitor map upload cleanup failed: ${String(cleanupError)}`),
    );
    throw error;
  }

  if (previous && previous.fileId !== stored.id) {
    await deleteFile(ctx, previous.fileId).catch((error) =>
      console.error(`previous exhibitor map cleanup failed: ${String(error)}`),
    );
  }

  const current = await getExhibitorMap(ctx.eventId);
  if (!current) throw notFound('Exhibitor map');
  return current;
}

/** Removal revokes the stable public route before deleting its stored bytes. */
export async function removeExhibitorMap(ctx: EventContext): Promise<void> {
  requireCapability(ctx, 'event:manage');
  const current = await getExhibitorMap(ctx.eventId);
  if (!current) return;

  await getDb().delete(eventExhibitorMap).where(eq(eventExhibitorMap.eventId, ctx.eventId));
  await deleteFile(ctx, current.fileId).catch((error) =>
    console.error(`exhibitor map cleanup failed: ${String(error)}`),
  );
}

export type PublicExhibitorMap = {
  eventId: string;
  eventName: string;
  eventSlug: string;
  file: FileRecord | null;
  fileUrl: string | null;
};

/** Public metadata for the embed page; an existing event with no map gets a useful empty state. */
export async function getPublicExhibitorMap(slug: string): Promise<PublicExhibitorMap | null> {
  const owner = await getDb().query.event.findFirst({ where: eq(event.slug, slug) });
  if (!owner) return null;
  const map = await getExhibitorMap(owner.id);
  return {
    eventId: owner.id,
    eventName: owner.name,
    eventSlug: owner.slug,
    file: map?.file ?? null,
    fileUrl: map ? exhibitorMapFilePath(owner.slug) : null,
  };
}

/** The only unauthenticated byte read: current slot + matching event slug + matching file event. */
export async function readPublicExhibitorMap(slug: string) {
  const owner = await getDb().query.event.findFirst({ where: eq(event.slug, slug) });
  if (!owner) throw notFound('Exhibitor map');

  const [row] = await getDb()
    .select({ slot: eventExhibitorMap, record: file })
    .from(eventExhibitorMap)
    .innerJoin(
      file,
      and(eq(file.id, eventExhibitorMap.fileId), eq(file.eventId, eventExhibitorMap.eventId)),
    )
    .where(eq(eventExhibitorMap.eventId, owner.id))
    .limit(1);
  if (!row) throw notFound('Exhibitor map');

  const object = await getStorage().get(row.record.storageKey);
  return {
    record: row.record,
    body: object.body,
    contentType: row.record.contentType || object.contentType,
  };
}
