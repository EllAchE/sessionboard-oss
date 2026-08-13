import { NextResponse } from 'next/server';
import { httpStatus, invalid, toPublicError } from '../../../../../lib/errors';
import { listEventFileIndex, readFile } from '../../../../../lib/services/files';
import type { EventFileRow } from '../../../../../lib/services/files';
import { decideContext } from '../../context';
import { archiveFilename, checkArchiveBudget, planArchive } from '../archive';
import { zipStream, type ZipEntry } from '../zip';

export const dynamic = 'force-dynamic';

/**
 * `V-11`. A POST rather than a GET because the id list outgrows a query string long before an
 * organizer's patience does, and a form submit keeps the browser's own download machinery — no blob
 * held in a tab, no progress bar to reimplement.
 *
 * Every id is resolved against the event's own file index before a single byte is written, so the
 * response status is settled while it can still be changed. After that the archive streams, one
 * buffered file at a time.
 */
export async function POST(request: Request) {
  try {
    const ctx = await decideContext();
    const form = await request.formData();
    const requested = new Set(
      String(form.get('ids') ?? '')
        .split(/[\s,]+/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    );

    const index = await listEventFileIndex(ctx);
    const subjects = index.filter((row) => requested.has(row.id));
    const missing = [...requested].filter((id) => !subjects.some((row) => row.id === id));
    if (missing.length > 0) {
      throw invalid(`${missing.length} of those files are not on this event`);
    }

    const refusal = checkArchiveBudget(
      subjects.length,
      subjects.reduce((sum, row) => sum + row.sizeBytes, 0),
    );
    if (refusal) throw invalid(refusal.message);

    const plan = planArchive(
      subjects.map((row) => ({
        fileId: row.id,
        filename: row.filename,
        submissionRef: row.submissionRef,
        ownerName: row.ownerName,
      })),
    );
    const byId = new Map<string, EventFileRow>(subjects.map((row) => [row.id, row]));

    async function* entries(): AsyncGenerator<ZipEntry> {
      const unreadable: string[] = [];
      for (const item of plan) {
        const record = byId.get(item.fileId);
        try {
          const stored = await readFile(ctx, item.fileId);
          const bytes = new Uint8Array(await new Response(stored.body).arrayBuffer());
          yield { name: item.name, bytes, modifiedAt: record?.createdAt };
        } catch (error) {
          console.error(
            `archive skipped ${item.fileId}: ${error instanceof Error ? error.message : String(error)}`,
          );
          unreadable.push(item.name);
        }
      }
      // An archive that quietly drops a deck is worse than one that says which deck it dropped.
      if (unreadable.length > 0) {
        yield {
          name: '_missing-records.txt',
          bytes: new TextEncoder().encode(
            `These records appear in the annals but could not be read from the archive:\n\n${unreadable.join('\n')}\n`,
          ),
        };
      }
    }

    return new Response(zipStream(entries()), {
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="${archiveFilename()}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    const publicError = toPublicError(error);
    return NextResponse.json(
      { ok: false, message: publicError.message },
      { status: httpStatus(error) },
    );
  }
}
