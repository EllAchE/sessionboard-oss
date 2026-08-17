import { eq } from 'drizzle-orm';
import type { RomanSpeakerHeadshotGender } from '../../lib/roman-speaker-headshots';
import { getStorage, storageKey } from '../../lib/storage';
import type { Database } from '../client';
import { file } from '../schema';
import { createRomanProfileArtAssignments } from './roman-profile-art';

/**
 * Putting generated speaker portraits where the app will find them: bytes into whichever storage
 * backend is configured, one `file` row each, and the ids back so the caller can set
 * `participant.headshot_file_id`.
 *
 * Shared rather than private to one seed because it was private to one seed. The generator has
 * always produced portraits for anybody who asked, but only the first-settlement seed knew how to
 * store them, so the `demo` event — the one every link in the README points at — showed initials
 * where its speaker photos should be.
 */

async function inBatches<T>(
  items: readonly T[],
  size: number,
  operation: (item: T) => Promise<void>,
): Promise<void> {
  for (let start = 0; start < items.length; start += size) {
    await Promise.all(items.slice(start, start + size).map(operation));
  }
}

/**
 * Deleting an event cascades to its `file` rows but says nothing about the objects they name, which
 * on the database backend are rows of their own in `file_blob`. A re-runnable seed that skipped this
 * would leak every portrait it has ever generated.
 */
export async function removeEventFiles(db: Database, eventId: string): Promise<void> {
  const records = await db
    .select({ storageKey: file.storageKey })
    .from(file)
    .where(eq(file.eventId, eventId));
  const storage = getStorage();
  await inBatches(records, 24, (record) => storage.delete(record.storageKey));
}

export async function seedProfileArt<SpeakerKey extends string>(
  db: Database,
  params: {
    eventId: string;
    uploadedByUserId: string;
    speakerKeys: readonly SpeakerKey[];
    slotOffset?: number;
    gender?: (speakerKey: SpeakerKey) => RomanSpeakerHeadshotGender | undefined;
  },
): Promise<Map<SpeakerKey, string>> {
  const storage = getStorage();
  const artwork = createRomanProfileArtAssignments(params.speakerKeys, {
    slotOffset: params.slotOffset,
    gender: params.gender,
  });
  const uploads = artwork.map((assignment) => ({
    assignment,
    row: {
      eventId: params.eventId,
      storageKey: storageKey(params.eventId, assignment.filename),
      filename: assignment.filename,
      contentType: assignment.contentType,
      sizeBytes: assignment.bytes.byteLength,
      uploadedByUserId: params.uploadedByUserId,
    },
  }));

  await inBatches(uploads, 24, ({ assignment, row }) =>
    storage.put(row.storageKey, assignment.bytes, assignment.contentType),
  );

  const records = await db
    .insert(file)
    .values(uploads.map(({ row }) => row))
    .returning({ id: file.id, storageKey: file.storageKey });
  const idByStorageKey = new Map(records.map((record) => [record.storageKey, record.id]));
  return new Map(
    uploads.map(({ assignment, row }) => {
      const fileId = idByStorageKey.get(row.storageKey);
      if (!fileId) throw new Error(`Profile art insert omitted ${row.storageKey}`);
      return [assignment.speakerKey, fileId] as const;
    }),
  );
}
