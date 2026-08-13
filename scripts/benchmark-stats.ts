/**
 * `Z-4`. The arithmetic behind `scripts/benchmark.ts`, kept in its own module so it can be tested.
 *
 * The benchmark itself is a top-level-await script: importing it runs it. Percentile and
 * error-classification bugs would be invisible in the output and would quietly turn a measurement
 * into a fabrication, which is the one thing a benchmark used as evidence must not do, so they live
 * here instead and are covered by `benchmark-stats.test.ts`.
 */

export type ErrorKind = 'cpu-limit' | 'server-error' | 'client-error' | 'transport';

export type LatencySummary = {
  min: number;
  mean: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  max: number;
};

/** Cloudflare serves this string in the body when a Worker blows the plan's CPU ceiling. */
export const CPU_LIMIT_MARKER = 'error code: 1102';

/**
 * `cpu-limit` is deliberately its own bucket rather than part of `server-error`: a Workers free-plan
 * deployment over the 10ms CPU cap is a hosting-plan fact, and a deployment bug is an application
 * fact. A single error rate cannot tell the reader which one they are looking at.
 */
export function classify(status: number, body: string): ErrorKind | null {
  if (status >= 500) {
    if (status === 503 || body.includes(CPU_LIMIT_MARKER)) return 'cpu-limit';
    return 'server-error';
  }
  if (status >= 400) return 'client-error';
  return null;
}

/**
 * Nearest-rank, on an already-sorted ascending array. Interpolating between neighbours invents
 * precision that a few hundred samples do not contain.
 */
export function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return Number.NaN;
  const rank = Math.ceil(fraction * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

export function summarise(latencies: readonly number[]): LatencySummary {
  const sorted = [...latencies].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    min: sorted[0] ?? Number.NaN,
    mean: sorted.length > 0 ? total / sorted.length : Number.NaN,
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted[sorted.length - 1] ?? Number.NaN,
  };
}

/** `--key=value`, `--key` (implying `true`), and values that themselves contain `=`. */
export function parseArgs(argv: readonly string[]): Map<string, string> {
  const parsed = new Map<string, string>();
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [rawKey, ...rest] = arg.slice(2).split('=');
    parsed.set(rawKey, rest.length > 0 ? rest.join('=') : 'true');
  }
  return parsed;
}
