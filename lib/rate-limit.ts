import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { inboundRateLimit } from '@/db/schema';
import { rateLimited } from '@/lib/errors';
import { hashToken } from '@/lib/ids';

export type RateLimitPolicy = {
  namespace: string;
  limit: number;
  windowSeconds: number;
};

export type RateLimitResult = {
  limit: number;
  remaining: number;
  resetAt: Date;
};

export const PUBLIC_API_RATE_LIMIT: RateLimitPolicy = {
  namespace: 'public-api',
  limit: 120,
  windowSeconds: 60,
};

export const API_KEY_RATE_LIMIT: RateLimitPolicy = {
  namespace: 'api-key',
  limit: 600,
  windowSeconds: 60,
};

export const SPEAKER_API_RATE_LIMIT: RateLimitPolicy = {
  namespace: 'speaker-api',
  limit: 300,
  windowSeconds: 60,
};

export const MAGIC_LINK_RATE_LIMIT: RateLimitPolicy = {
  namespace: 'magic-link-email',
  limit: 5,
  windowSeconds: 15 * 60,
};

export const MAGIC_LINK_IP_RATE_LIMIT: RateLimitPolicy = {
  namespace: 'magic-link-ip',
  limit: 30,
  windowSeconds: 15 * 60,
};

export function rateLimitWindow(now: Date, windowSeconds: number): {
  startedAt: Date;
  resetAt: Date;
} {
  const windowMs = windowSeconds * 1_000;
  const startedAtMs = Math.floor(now.getTime() / windowMs) * windowMs;
  return {
    startedAt: new Date(startedAtMs),
    resetAt: new Date(startedAtMs + windowMs),
  };
}

/**
 * Atomically consumes one request from a fixed window. The database is the coordinator, so the
 * limit remains real across Cloudflare isolates and across multiple self-hosted Node processes.
 */
export async function consumeRateLimit(
  identity: string,
  policy: RateLimitPolicy,
  now = new Date(),
): Promise<RateLimitResult> {
  const { startedAt, resetAt } = rateLimitWindow(now, policy.windowSeconds);
  const keyHash = await hashToken(`${policy.namespace}:${identity}`);
  const db = getDb();

  const [counter] = await db
    .insert(inboundRateLimit)
    .values({ keyHash, windowStartedAt: startedAt, requestCount: 1, updatedAt: now })
    .onConflictDoUpdate({
      target: inboundRateLimit.keyHash,
      set: {
        requestCount: sql<number>`case
          when ${inboundRateLimit.windowStartedAt} = ${startedAt}
            then ${inboundRateLimit.requestCount} + 1
          else 1
        end`,
        windowStartedAt: startedAt,
        updatedAt: now,
      },
    })
    .returning({ requestCount: inboundRateLimit.requestCount });

  const requestCount = counter?.requestCount ?? policy.limit + 1;
  const remaining = Math.max(0, policy.limit - requestCount);
  if (requestCount > policy.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1_000));
    throw rateLimited(
      'Too many requests. Try again after the current limit window.',
      retryAfterSeconds,
    );
  }

  return { limit: policy.limit, remaining, resetAt };
}

/** Proxy headers are set by Cloudflare and the documented self-host reverse proxy. */
export function requestClientAddress(request: { headers: Headers }): string {
  return (
    request.headers.get('cf-connecting-ip')?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

export async function enforcePublicApiRateLimit(request: Request): Promise<RateLimitResult> {
  return consumeRateLimit(requestClientAddress(request), PUBLIC_API_RATE_LIMIT);
}

export async function enforceMagicLinkRateLimit(email: string): Promise<RateLimitResult> {
  return consumeRateLimit(email.trim().toLowerCase(), MAGIC_LINK_RATE_LIMIT);
}

export async function enforceMagicLinkIpRateLimit(request: Request): Promise<RateLimitResult> {
  return consumeRateLimit(requestClientAddress(request), MAGIC_LINK_IP_RATE_LIMIT);
}
