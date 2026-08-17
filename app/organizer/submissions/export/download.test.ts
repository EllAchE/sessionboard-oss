import { describe, expect, it, vi } from 'vitest';
import {
  downloadReviewResults,
  filenameFromContentDisposition,
  reviewExportUrl,
} from './download';

/**
 * `ABS-13`. The finding this file guards is that clicking Export CSV produced no observable result.
 * Every case below is therefore about what the organizer is told afterwards, not about the bytes.
 */

function response(init: {
  ok?: boolean;
  status?: number;
  disposition?: string | null;
  json?: unknown;
}): Response {
  const headers = new Headers();
  if (init.disposition) headers.set('content-disposition', init.disposition);
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers,
    blob: async () => new Blob(['a,b\n1,2\n'], { type: 'text/csv' }),
    json: async () => {
      if (init.json === undefined) throw new Error('not json');
      return init.json;
    },
  } as unknown as Response;
}

describe('filenameFromContentDisposition', () => {
  it('reads the quoted filename the export route sends', () => {
    expect(
      filenameFromContentDisposition(
        'attachment; filename="cicero-forum-initial-review-reviews-2026-08-17.csv"',
      ),
    ).toBe('cicero-forum-initial-review-reviews-2026-08-17.csv');
  });

  it('reads an unquoted filename', () => {
    expect(filenameFromContentDisposition('attachment; filename=results.csv')).toBe('results.csv');
  });

  it('prefers the RFC 5987 encoding, which is the one that survives a non-ASCII event name', () => {
    expect(
      filenameFromContentDisposition(
        "attachment; filename=\"fallback.csv\"; filename*=UTF-8''caf%C3%A9-reviews.csv",
      ),
    ).toBe('café-reviews.csv');
  });

  it('falls back to the plain filename when the extended one is malformed', () => {
    expect(
      filenameFromContentDisposition(
        "attachment; filename=\"fallback.csv\"; filename*=UTF-8''%E0%A4%A.csv",
      ),
    ).toBe('fallback.csv');
  });

  it('returns null when there is no header to read', () => {
    expect(filenameFromContentDisposition(null)).toBeNull();
    expect(filenameFromContentDisposition('attachment')).toBeNull();
  });
});

describe('downloadReviewResults', () => {
  it('reports the filename the server chose, and hands that file to the browser', async () => {
    const saved: Array<{ blob: Blob; filename: string }> = [];
    const requested: string[] = [];
    const fetchImpl = (async (url: string) => {
      requested.push(url);
      return response({
        disposition: 'attachment; filename="cicero-forum-round-1-reviews-2026-08-17.csv"',
      });
    }) as unknown as typeof fetch;

    const outcome = await downloadReviewResults('round-1', {
      fetchImpl,
      save: (blob, filename) => saved.push({ blob, filename }),
    });

    expect(outcome).toEqual({ ok: true, filename: 'cicero-forum-round-1-reviews-2026-08-17.csv' });
    expect(saved).toHaveLength(1);
    expect(saved[0].filename).toBe('cicero-forum-round-1-reviews-2026-08-17.csv');
    expect(await saved[0].blob.text()).toBe('a,b\n1,2\n');
    expect(requested).toEqual([reviewExportUrl('round-1')]);
  });

  it('escapes the round id it puts in the query string', () => {
    expect(reviewExportUrl('a b/c')).toBe('/organizer/submissions/export?round=a%20b%2Fc');
  });

  it('surfaces the server refusal rather than looking like nothing happened', async () => {
    const save = vi.fn();
    const outcome = await downloadReviewResults('round-1', {
      fetchImpl: (async () =>
        response({
          ok: false,
          status: 403,
          json: { code: 'forbidden', message: 'This action needs the submission:decide permission' },
        })) as unknown as typeof fetch,
      save,
    });

    expect(outcome).toEqual({
      ok: false,
      message: 'This action needs the submission:decide permission',
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('still reports a failure when the error body is not JSON', async () => {
    const outcome = await downloadReviewResults('round-1', {
      fetchImpl: (async () => response({ ok: false, status: 500 })) as unknown as typeof fetch,
      save: vi.fn(),
    });

    expect(outcome).toEqual({ ok: false, message: 'Export failed (500)' });
  });

  it('reports a dead network instead of rejecting', async () => {
    const outcome = await downloadReviewResults('round-1', {
      fetchImpl: (async () => {
        throw new Error('offline');
      }) as unknown as typeof fetch,
      save: vi.fn(),
    });

    expect(outcome).toEqual({
      ok: false,
      message: 'Export failed: the server could not be reached',
    });
  });

  it('refuses without a round rather than asking the server for every round at once', async () => {
    const fetchImpl = vi.fn();
    const outcome = await downloadReviewResults('', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      save: vi.fn(),
    });

    expect(outcome).toEqual({ ok: false, message: 'Choose a review round to export' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('falls back to a usable name when the server sent no disposition', async () => {
    const outcome = await downloadReviewResults('round-1', {
      fetchImpl: (async () => response({ disposition: null })) as unknown as typeof fetch,
      save: vi.fn(),
    });

    expect(outcome).toEqual({ ok: true, filename: 'review-results.csv' });
  });
});
