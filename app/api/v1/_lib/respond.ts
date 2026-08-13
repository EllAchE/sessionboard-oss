import { z } from 'zod';
import { httpStatus, invalid, toPublicError } from '@/lib/errors';

/**
 * Handlers stay thin (`docs/02-architecture.md` §5): parse, validate, call, translate. Everything
 * below is translation, so no route file grows a second job.
 */

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  /** The public reads are event data an embed or a partner site fetches cross-origin. */
  'access-control-allow-origin': '*',
};

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
  return json({ error: publicError }, { status: httpStatus(error) });
}

/** Every handler is this shape, so a thrown `AppError` never escapes as a 500 with a stack trace. */
export async function handle(work: () => Promise<Response>): Promise<Response> {
  try {
    return await work();
  } catch (error) {
    return errorJson(error);
  }
}

export function parseQuery<T extends z.ZodTypeAny>(schema: T, url: URL): z.infer<T> {
  const parsed = schema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success)
    throw invalid('Those query parameters are not valid', zodDetails(parsed.error));
  return parsed.data;
}

export async function parseBody<T extends z.ZodTypeAny>(
  schema: T,
  request: Request,
): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw invalid('Send a JSON petition body');
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw invalid('That request body is not valid', zodDetails(parsed.error));
  return parsed.data;
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
