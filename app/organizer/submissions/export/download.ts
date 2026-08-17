/**
 * `ABS-13`. The browser's own download of an `attachment` response is silent by design: nothing in
 * the page changes, so an organizer who clicks Export CSV has no way to tell a finished export from
 * a permission error from a click that never registered. Fetching the file ourselves is what buys
 * the confirmation — we hold the response, so we can name the file we got and say plainly when the
 * server refused instead of leaving the page looking untouched.
 */

export type ReviewExportOutcome =
  | { ok: true; filename: string }
  | { ok: false; message: string };

/** Where the round-scoped export lives. One place, so the control and its tests cannot drift. */
export function reviewExportUrl(roundId: string): string {
  return `/organizer/submissions/export?round=${encodeURIComponent(roundId)}`;
}

/**
 * The filename the server chose, read back off `Content-Disposition`. `filename*` (RFC 5987) wins
 * when present because it is the encoding that survives non-ASCII event names.
 */
export function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;

  const extended = /filename\*\s*=\s*[^']*'[^']*'([^;]+)/i.exec(header);
  if (extended) {
    try {
      return decodeURIComponent(extended[1].trim()) || null;
    } catch {
      // A malformed percent-escape is not a reason to lose the plain `filename` below.
    }
  }

  const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/i.exec(header);
  if (!plain) return null;
  return (plain[2] ?? plain[1]).trim() || null;
}

/** The message the server sent, or a sentence the organizer can act on when it sent none. */
async function refusal(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    const message = (body as { message?: unknown } | null)?.message;
    if (typeof message === 'string' && message.length > 0) return message;
  } catch {
    // A non-JSON error body tells us nothing the status does not.
  }
  return `Export failed (${response.status})`;
}

export type DownloadDeps = {
  fetchImpl?: typeof fetch;
  /** Hands the finished file to the browser. Injected so this is testable without a DOM. */
  save?: (blob: Blob, filename: string) => void;
};

/** The browser default: an object URL behind a synthetic anchor click, revoked once it is used. */
function saveViaAnchor(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Runs the export and reports what happened. Never throws: the caller's job is to show the outcome,
 * and a rejected promise there would put us back to a click with no visible result.
 */
export async function downloadReviewResults(
  roundId: string,
  deps: DownloadDeps = {},
): Promise<ReviewExportOutcome> {
  if (!roundId) return { ok: false, message: 'Choose a review round to export' };

  const doFetch = deps.fetchImpl ?? fetch;
  const save = deps.save ?? saveViaAnchor;

  let response: Response;
  try {
    response = await doFetch(reviewExportUrl(roundId), {
      credentials: 'same-origin',
      headers: { accept: 'text/csv' },
    });
  } catch {
    return { ok: false, message: 'Export failed: the server could not be reached' };
  }

  if (!response.ok) return { ok: false, message: await refusal(response) };

  const filename =
    filenameFromContentDisposition(response.headers.get('content-disposition')) ??
    'review-results.csv';

  try {
    save(await response.blob(), filename);
  } catch {
    return { ok: false, message: 'The export was built but the browser refused the download' };
  }

  return { ok: true, filename };
}
