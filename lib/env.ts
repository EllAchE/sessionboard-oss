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
  // `next dev` exposes wrangler vars through its local Cloudflare context, but `.env` is the
  // developer-owned override surface. In particular, APP_URL must stay on localhost so magic-link
  // tokens created in the local database are consumed by the local app rather than production.
  return process.env[key] ?? fromCloudflare(key) ?? undefined;
}

export function requireEnv(key: string): string {
  const value = env(key);
  if (!value) throw new Error(`${key} is not set`);
  return value;
}

/**
 * An unrecognized value falls back rather than reading as false. That distinction only starts to
 * matter once a flag defaults to `true` — as `S3_FORCE_PATH_STYLE` does — because there a typo
 * would otherwise silently turn the flag off and break the setup it exists to protect. Callers that
 * default to `false` are unaffected either way: unrecognized and false reach the same answer.
 */
export function envFlag(key: string, fallback = false): boolean {
  const value = env(key)?.trim().toLowerCase();
  if (value === undefined || value === '') return fallback;
  if (value === '1' || value === 'true') return true;
  if (value === '0' || value === 'false') return false;
  return fallback;
}

export function publicTestModeEnabled(): boolean {
  return envFlag('CICERO_PUBLIC_TEST_MODE');
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
  sms: () => Boolean(env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN') && env('SMS_FROM')),
};
