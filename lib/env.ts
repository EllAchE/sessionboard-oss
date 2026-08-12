import { getCloudflareContext } from '@opennextjs/cloudflare';

/**
 * One reader for both targets. `@opennextjs/cloudflare` does mirror Worker vars and secrets onto
 * `process.env`, but only inside a request — a module-scoped `process.env.X` read at import time
 * sees nothing on Workers and everything self-hosted, which is exactly the kind of difference that
 * shows up first in production. Read through here, at call time, and the two targets agree.
 *
 * Bindings are not env vars and do not come through here: `HYPERDRIVE` and the R2 buckets are
 * objects, fetched from the Cloudflare context by the modules that own them.
 *
 * On a deployed Worker the Cloudflare env is the only source consulted and `process.env` is ignored
 * rather than used as a fallback. OpenNext compiles whatever `.env` sat next to the build into the
 * bundle and injects it at runtime, so a developer's local file otherwise outranks the deployed
 * Worker's own configuration — which is how production came to address a MinIO container on
 * localhost and fail every upload. `next dev` keeps the fallback, because there the Cloudflare
 * context is a miniflare that only knows `wrangler.jsonc` and `.dev.vars`, and `.env` is still the
 * documented place to configure a local machine. Self-hosted there is no context at all.
 */
function fromCloudflare(key: string): string | undefined {
  try {
    const value = (getCloudflareContext().env as unknown as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : undefined;
  } catch {
    return undefined;
  }
}

function deployedToWorkers(): boolean {
  if (process.env.NODE_ENV === 'development') return false;
  try {
    getCloudflareContext();
    return true;
  } catch {
    return false;
  }
}

export function env(key: string): string | undefined {
  if (deployedToWorkers()) return fromCloudflare(key);
  return fromCloudflare(key) ?? process.env[key] ?? undefined;
}

export function requireEnv(key: string): string {
  const value = env(key);
  if (!value) throw new Error(`${key} is not set`);
  return value;
}

export function envFlag(key: string, fallback = false): boolean {
  const value = env(key);
  if (value === undefined) return fallback;
  return value === '1' || value.toLowerCase() === 'true';
}

/**
 * Absolute origin for magic links, ICS URLs and embed snippets — all of which are read outside a
 * request, in an inbox or on someone else's website, so a relative path is never enough.
 */
export function appUrl(): string {
  return (env('APP_URL') ?? 'http://localhost:3000').replace(/\/+$/, '');
}

/** Optional-feature switches. Each surface degrades to disabled rather than erroring when unset. */
export const features = {
  ai: () => Boolean(env('ANTHROPIC_API_KEY')),
  airtable: () => Boolean(env('AIRTABLE_API_KEY') && env('AIRTABLE_BASE_ID')),
  accelevents: () => Boolean(env('ACCELEVENTS_API_KEY')),
};
