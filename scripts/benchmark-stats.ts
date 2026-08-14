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

export type ProcessCpuInfo = { ppid: number; cpuMs: number };

/**
 * macOS has no `/proc`, so `--cpu-pid` falls back to `ps`'s own cumulative-CPU-time column there.
 * Its format is `[[dd-]hh:]mm:ss.ss`, unbounded on the left rather than rolling over into the next
 * unit — a process with 144 minutes of CPU time reads `144:19.27`, never `2:24:19.27`. Returns
 * milliseconds, or `null` for anything that is not that shape.
 */
export function parseBsdCpuTime(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let rest = trimmed;
  let days = 0;
  const dashIndex = rest.indexOf('-');
  if (dashIndex !== -1) {
    days = Number(rest.slice(0, dashIndex));
    rest = rest.slice(dashIndex + 1);
  }
  if (!Number.isFinite(days)) return null;

  const parts = rest.split(':');
  if (parts.length === 0) return null;

  let seconds = days * 86400;
  let multiplier = 1;
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const value = Number(parts[index]);
    if (!Number.isFinite(value)) return null;
    seconds += value * multiplier;
    multiplier *= 60;
  }
  return seconds * 1000;
}

/**
 * Sums CPU across every named process and its descendants, given a `pid -> {ppid, cpuMs}` table
 * built from either `/proc` (Linux) or `ps` (macOS) — both backends land here so the walk itself
 * only needs testing once. Takes a list of roots because a server is not always one process:
 * `wrangler dev` runs two sibling `workerd` processes under a supervisor whose own CPU should not
 * be billed to the app.
 */
export function sumProcessTreeCpuMs(
  rootPids: readonly number[],
  table: ReadonlyMap<number, ProcessCpuInfo>,
): number | null {
  // A root that has already exited means the measurement is meaningless, not merely incomplete.
  if (rootPids.length === 0 || rootPids.some((pid) => !table.has(pid))) return null;

  const children = new Map<number, number[]>();
  for (const [pid, info] of table) {
    children.set(info.ppid, [...(children.get(info.ppid) ?? []), pid]);
  }

  let cpuMs = 0;
  const queue = [...rootPids];
  const seen = new Set<number>();
  while (queue.length > 0) {
    const pid = queue.pop() as number;
    if (seen.has(pid)) continue;
    seen.add(pid);
    cpuMs += table.get(pid)?.cpuMs ?? 0;
    queue.push(...(children.get(pid) ?? []));
  }
  return cpuMs;
}
