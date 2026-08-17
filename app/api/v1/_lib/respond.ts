import { z } from 'zod';
import { isDatabaseUnavailableError } from '@/lib/database-errors';
import { AppError, httpStatus, invalid, isAppError, toPublicError } from '@/lib/errors';

/**
 * Handlers stay thin (`docs/02-architecture.md` §5): parse, validate, call, translate. Everything
 * below is translation, so no route file grows a second job.
 */

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  /** The public reads are event data an embed or a partner site fetches cross-origin. */
  'access-control-allow-origin': '*',
};

const MAX_QUERY_ENTRIES = 20;
const MAX_QUERY_KEY_BYTES = 64;
const MAX_QUERY_VALUE_BYTES = 256;
const MAX_JSON_BODY_BYTES = 256 * 1024;
const MAX_JSON_DEPTH = 32;

class JsonBodyTooLargeError extends Error {}
class JsonBodyTooDeepError extends Error {}
class DuplicateJsonKeyError extends Error {}

export function json(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { ...JSON_HEADERS, ...init.headers },
  });
}

export function errorJson(error: unknown): Response {
  const publicError = toPublicError(error);
  if (publicError.code === 'internal') {
    console.error(error instanceof Error ? error.message : String(error));
  }
  // Both of these mean "not now" rather than "not ever", so both carry the hint that says so.
  const retryAfter =
    publicError.code === 'rate_limited' || publicError.code === 'unavailable'
      ? publicError.details?.retryAfterSeconds
      : undefined;
  return json(
    { error: publicError },
    {
      status: httpStatus(error),
      headers: retryAfter ? { 'retry-after': retryAfter } : undefined,
    },
  );
}

/** Every handler is this shape, so a thrown `AppError` never escapes as a 500 with a stack trace. */
export async function handle(work: () => Promise<Response>): Promise<Response> {
  try {
    return await work();
  } catch (error) {
    // A database that is down is the one unrecognised throw worth naming. Left alone it is a 500,
    // which tells an embed or a partner integration to give up; as a 503 with `Retry-After` it
    // tells them to come back, which is both true and recoverable.
    if (!isAppError(error) && isDatabaseUnavailableError(error)) {
      console.error(error instanceof Error ? error.message : String(error));
      return errorJson(
        new AppError('unavailable', 'That data is temporarily unavailable. Try again shortly.', {
          retryAfterSeconds: '30',
        }),
      );
    }
    return errorJson(error);
  }
}

export function parseQuery<T extends z.ZodTypeAny>(schema: T, url: URL): z.infer<T> {
  try {
    decodeURIComponent(url.search.replace(/\+/g, '%20'));
  } catch {
    throw invalid('Those query parameters are not valid');
  }

  const entries = Array.from(url.searchParams);
  const seen = new Set<string>();
  const encoder = new TextEncoder();
  const invalidEntry = entries.find(([key, value]) => {
    if (
      encoder.encode(key).byteLength > MAX_QUERY_KEY_BYTES ||
      encoder.encode(value).byteLength > MAX_QUERY_VALUE_BYTES ||
      /[\u0000-\u001f\u007f]/u.test(key) ||
      /[\u0000-\u001f\u007f]/u.test(value) ||
      seen.has(key)
    ) {
      return true;
    }
    seen.add(key);
    return false;
  });
  if (entries.length > MAX_QUERY_ENTRIES || invalidEntry) {
    throw invalid('Those query parameters are not valid');
  }

  const parsed = schema.safeParse(Object.fromEntries(entries));
  if (!parsed.success)
    throw invalid('Those query parameters are not valid', zodDetails(parsed.error));
  return parsed.data;
}

export async function parseBody<T extends z.ZodTypeAny>(
  schema: T,
  request: Request,
): Promise<z.infer<T>> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!/^application\/(?:[a-z0-9!#$&^_.+-]+\+)?json(?:\s*;|$)/i.test(contentType)) {
    throw invalid('Use Content-Type: application/json');
  }

  const declaredLength = request.headers.get('content-length');
  if (
    declaredLength &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > MAX_JSON_BODY_BYTES
  ) {
    throw invalid('That JSON body is too large');
  }

  let raw: unknown;
  try {
    const text = await readLimitedBody(request);
    assertJsonStructure(text);
    raw = JSON.parse(text);
  } catch (error) {
    if (error instanceof JsonBodyTooLargeError) throw invalid('That JSON body is too large');
    if (error instanceof JsonBodyTooDeepError) throw invalid('That JSON body is nested too deeply');
    if (error instanceof DuplicateJsonKeyError)
      throw invalid('Duplicate JSON object keys are not allowed');
    throw invalid('Send a JSON body');
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw invalid('That request body is not valid', zodDetails(parsed.error));
  return parsed.data;
}

type JsonContainer =
  { kind: 'array' } | { kind: 'object'; keys: Set<string>; expectingKey: boolean };

function assertJsonStructure(text: string): void {
  const stack: JsonContainer[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '{') {
      stack.push({ kind: 'object', keys: new Set(), expectingKey: true });
      if (stack.length > MAX_JSON_DEPTH) throw new JsonBodyTooDeepError();
      continue;
    }
    if (character === '[') {
      stack.push({ kind: 'array' });
      if (stack.length > MAX_JSON_DEPTH) throw new JsonBodyTooDeepError();
      continue;
    }
    if (character === '}' || character === ']') {
      stack.pop();
      continue;
    }
    if (character === ',') {
      const container = stack[stack.length - 1];
      if (container?.kind === 'object') container.expectingKey = true;
      continue;
    }
    if (character !== '"') continue;

    let end = index + 1;
    while (end < text.length) {
      if (text[end] === '\\') {
        end += 2;
        continue;
      }
      if (text[end] === '"') break;
      end += 1;
    }

    const container = stack[stack.length - 1];
    if (container?.kind === 'object' && container.expectingKey) {
      let separator = end + 1;
      while (/\s/.test(text[separator] ?? '')) separator += 1;
      if (text[separator] === ':') {
        const key = JSON.parse(text.slice(index, end + 1)) as string;
        if (container.keys.has(key)) throw new DuplicateJsonKeyError();
        container.keys.add(key);
        container.expectingKey = false;
      }
    }
    index = end;
  }
}

async function readLimitedBody(request: Request): Promise<string> {
  if (!request.body) return '';

  const chunks: Uint8Array[] = [];
  const reader = request.body.getReader();
  let byteLength = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_JSON_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new JsonBodyTooLargeError();
    }
    chunks.push(value);
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    throw invalid('Send a JSON body');
  }
}

function zodDetails(error: z.ZodError): Record<string, string> {
  const details: Record<string, string> = {};
  for (const issue of error.issues) {
    details[issue.path.join('.') || '_'] = issue.message;
  }
  return details;
}

export function isoOrNull(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

/**
 * Public reads are cached briefly at the edge: an embed on a busy site can fetch the same agenda
 * hundreds of times a minute, and thirty seconds of staleness is invisible against a schedule that
 * changes daily. `stale-while-revalidate` keeps the slow path off the critical path.
 */
export const PUBLIC_CACHE = {
  'cache-control': 'public, max-age=30, stale-while-revalidate=300',
};
/** Never cached; the response depends on which key asked. */
export const PRIVATE_CACHE = { 'cache-control': 'no-store' };
