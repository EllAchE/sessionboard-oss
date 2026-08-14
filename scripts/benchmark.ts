/**
 * `Z-4`. A dependency-free HTTP benchmark for the five routes a visitor actually lands on.
 *
 * There is no load generator in this repo and no reason to add one: `fetch`, `performance.now()`
 * and a fixed pool of workers cover a closed-loop benchmark completely, and a benchmark nobody can
 * run because it needs k6 installed is not evidence of anything. Run it with:
 *
 *   bun run bench                                   # against a local server on :3000
 *   bun run bench -- --target=https://example.com   # against a deployment
 *
 * Latency is measured to the last byte of the response body, not to the first. A server that
 * streams headers immediately and then stalls is not fast, and time-to-first-byte would hide that.
 *
 * HTTP 503 and Cloudflare's `error code: 1102` are counted apart from every other failure. That
 * pair is the specific way a Workers free-plan deployment fails when a render exceeds the 10ms CPU
 * cap (see the README's closing section), so collapsing it into a general error rate would throw
 * away the one number worth knowing about this deployment.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

import type { ErrorKind, LatencySummary, ProcessCpuInfo } from './benchmark-stats';
import {
  CPU_LIMIT_MARKER,
  classify,
  parseArgs,
  parseBsdCpuTime,
  summarise,
  sumProcessTreeCpuMs,
} from './benchmark-stats';

type Sample = {
  latencyMs: number;
  status: number | null;
  bytes: number;
  errorKind: ErrorKind | null;
  detail?: string;
};

type RouteSpec = { name: string; path: string; expect: 'html' | 'json' };

type RouteResult = {
  name: string;
  path: string;
  requests: number;
  wallMs: number;
  throughputPerSecond: number;
  successes: number;
  errorRate: number;
  statusCounts: Record<string, number>;
  errorCounts: Record<ErrorKind, number>;
  latency: LatencySummary;
  meanBytes: number;
  /** Null unless `--cpu-pid` named a local server process. Milliseconds of CPU per request. */
  serverCpuMsPerRequest: number | null;
  notes: string[];
};

const DEFAULT_TARGET = 'http://localhost:3000';
const USER_AGENT = 'cicero-benchmark/1.0 (+scripts/benchmark.ts)';

const args = parseArgs(process.argv.slice(2));

function option(name: string, envName: string, fallback: string): string {
  return args.get(name) ?? process.env[envName] ?? fallback;
}

function numericOption(name: string, envName: string, fallback: number): number {
  const raw = option(name, envName, String(fallback));
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`--${name} must be a positive number, received ${JSON.stringify(raw)}`);
  }
  return value;
}

const target = option('target', 'CICERO_BENCH_TARGET', DEFAULT_TARGET).replace(/\/+$/, '');
const eventSlug = option('event', 'CICERO_BENCH_EVENT', 'demo');
const formSlug = option('form', 'CICERO_BENCH_FORM', 'speak');
const requestsPerRoute = Math.round(numericOption('requests', 'CICERO_BENCH_REQUESTS', 200));
const concurrency = Math.round(numericOption('concurrency', 'CICERO_BENCH_CONCURRENCY', 8));
const warmupPerRoute = Math.round(numericOption('warmup', 'CICERO_BENCH_WARMUP', 10));
const timeoutMs = Math.round(numericOption('timeout', 'CICERO_BENCH_TIMEOUT', 20_000));
const jsonOut = args.get('json') ?? process.env.CICERO_BENCH_JSON ?? null;
const cpuPid = args.get('cpu-pid') ?? process.env.CICERO_BENCH_CPU_PID ?? null;

const routes: RouteSpec[] = [
  { name: 'home', path: '/', expect: 'html' },
  { name: 'event', path: `/${eventSlug}`, expect: 'html' },
  { name: 'agenda', path: `/${eventSlug}/agenda`, expect: 'html' },
  { name: 'submission form', path: `/submit/${eventSlug}/${formSlug}`, expect: 'html' },
  { name: 'agenda API', path: `/api/v1/events/${eventSlug}/agenda`, expect: 'json' },
];

/**
 * Process CPU accounting, only meaningful when the server runs on this machine. It exists because
 * the free-plan failure this benchmark watches for is a *CPU* ceiling, and wall-clock latency says
 * nothing about CPU: a route can be slow because Postgres is slow and still cost 2ms of CPU. Node
 * is not workerd, so treat the result as an order of magnitude, never as a Workers measurement.
 *
 * Two backends, picked by `process.platform`, both landing in the same `pid -> {ppid, cpuMs}` table
 * shape so `sumProcessTreeCpuMs` (in `./benchmark-stats`, where it can be tested) only needs writing
 * once: Linux reads `/proc/<pid>/stat` directly; macOS has no `/proc`, so it shells out to `ps` for
 * the same cumulative-CPU-time column instead.
 */
function clockTicksPerSecond(): number {
  try {
    const ticks = Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).trim());
    return Number.isFinite(ticks) && ticks > 0 ? ticks : 100;
  } catch {
    return 100;
  }
}

function readProcessTableLinux(ticksPerSecond: number): Map<number, ProcessCpuInfo> | null {
  let entries: string[];
  try {
    entries = readdirSync('/proc');
  } catch {
    return null;
  }

  const table = new Map<number, ProcessCpuInfo>();
  for (const entry of entries) {
    const pid = Number(entry);
    if (!Number.isInteger(pid)) continue;
    let stat: string;
    try {
      stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    } catch {
      continue; // The process exited between readdir and read. Normal, not an error.
    }
    // The comm field is parenthesised and may itself contain spaces, so split after the last ')'.
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    const ppid = Number(fields[1]);
    const utime = Number(fields[11]);
    const stime = Number(fields[12]);
    if (!Number.isFinite(ppid) || !Number.isFinite(utime) || !Number.isFinite(stime)) continue;
    table.set(pid, { ppid, cpuMs: ((utime + stime) / ticksPerSecond) * 1000 });
  }
  return table;
}

/**
 * `-axo` lists every process on the system regardless of controlling terminal — a dev server is
 * usually not attached to one, so plain `-a` would miss it — and the trailing `=` on each field
 * suppresses BSD `ps`'s header line so every row is data.
 */
function readProcessTableDarwin(): Map<number, ProcessCpuInfo> | null {
  let output: string;
  try {
    output = execFileSync('ps', ['-axo', 'pid=,ppid=,time='], { encoding: 'utf8' });
  } catch {
    return null;
  }

  const table = new Map<number, ProcessCpuInfo>();
  for (const line of output.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) continue;
    const pid = Number(parts[0]);
    const ppid = Number(parts[1]);
    const cpuMs = parseBsdCpuTime(parts[2]);
    if (!Number.isInteger(pid) || !Number.isInteger(ppid) || cpuMs === null) continue;
    table.set(pid, { ppid, cpuMs });
  }
  return table.size > 0 ? table : null;
}

function readProcessTable(ticksPerSecond: number): Map<number, ProcessCpuInfo> | null {
  return process.platform === 'darwin'
    ? readProcessTableDarwin()
    : readProcessTableLinux(ticksPerSecond);
}

function processTreeCpuMs(rootPids: readonly number[], ticksPerSecond: number): number | null {
  const table = readProcessTable(ticksPerSecond);
  if (!table) return null;
  return sumProcessTreeCpuMs(rootPids, table);
}

async function issue(url: string, expect: 'html' | 'json'): Promise<Sample> {
  const startedAt = performance.now();
  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': USER_AGENT,
        accept: expect === 'json' ? 'application/json' : 'text/html,application/xhtml+xml',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    // Drain the body before stopping the clock: headers-only timing flatters a streaming server.
    const body = await response.text();
    const latencyMs = performance.now() - startedAt;
    return {
      latencyMs,
      status: response.status,
      bytes: Buffer.byteLength(body),
      errorKind: classify(response.status, body),
    };
  } catch (error) {
    return {
      latencyMs: performance.now() - startedAt,
      status: null,
      bytes: 0,
      errorKind: 'transport',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runRoute(route: RouteSpec, sampleCpuMs: () => number | null): Promise<RouteResult> {
  const url = `${target}${route.path}`;

  for (let index = 0; index < warmupPerRoute; index += 1) {
    await issue(url, route.expect);
  }

  // Sampled after the warmup so JIT and first-render compilation land outside the window.
  const cpuBefore = sampleCpuMs();
  const samples: Sample[] = [];
  let issued = 0;
  const startedAt = performance.now();
  await Promise.all(
    Array.from({ length: Math.min(concurrency, requestsPerRoute) }, async () => {
      while (issued < requestsPerRoute) {
        issued += 1;
        samples.push(await issue(url, route.expect));
      }
    }),
  );
  const wallMs = performance.now() - startedAt;
  const cpuAfter = sampleCpuMs();

  const statusCounts: Record<string, number> = {};
  const errorCounts: Record<ErrorKind, number> = {
    'cpu-limit': 0,
    'server-error': 0,
    'client-error': 0,
    transport: 0,
  };
  for (const sample of samples) {
    const key = sample.status === null ? 'transport-error' : String(sample.status);
    statusCounts[key] = (statusCounts[key] ?? 0) + 1;
    if (sample.errorKind) errorCounts[sample.errorKind] += 1;
  }

  const successes = samples.filter((sample) => sample.errorKind === null).length;
  const notes: string[] = [];
  if (successes === 0) notes.push('no successful response — the numbers below measure failures');
  const transportDetail = samples.find((sample) => sample.errorKind === 'transport')?.detail;
  if (transportDetail) notes.push(`first transport error: ${transportDetail}`);

  return {
    name: route.name,
    path: route.path,
    requests: samples.length,
    wallMs,
    throughputPerSecond: samples.length / (wallMs / 1000),
    successes,
    errorRate: samples.length > 0 ? (samples.length - successes) / samples.length : 1,
    statusCounts,
    errorCounts,
    // Only successful responses shape the latency picture; a fast 404 is not a fast page.
    latency: summarise(
      samples.filter((sample) => sample.errorKind === null).map((sample) => sample.latencyMs),
    ),
    meanBytes:
      successes > 0
        ? Math.round(
            samples
              .filter((sample) => sample.errorKind === null)
              .reduce((sum, sample) => sum + sample.bytes, 0) / successes,
          )
        : 0,
    serverCpuMsPerRequest:
      cpuBefore !== null && cpuAfter !== null && samples.length > 0
        ? (cpuAfter - cpuBefore) / samples.length
        : null,
    notes,
  };
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : `${value}${' '.repeat(width - value.length)}`;
}

function padStart(value: string, width: number): string {
  return value.length >= width ? value : `${' '.repeat(width - value.length)}${value}`;
}

function fixed(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1) : '—';
}

async function main(): Promise<void> {
  const ticksPerSecond = clockTicksPerSecond();
  const rootPids = (cpuPid ?? '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
  const sampleCpuMs = (): number | null =>
    rootPids.length > 0 ? processTreeCpuMs(rootPids, ticksPerSecond) : null;

  // Say so rather than silently dropping the CPU column. `pgrep -f next-server` happily returns the
  // shell that ran the pgrep, so asking for CPU and getting none is an easy mistake to make twice.
  if (cpuPid !== null && sampleCpuMs() === null) {
    console.error(
      `warning: --cpu-pid=${cpuPid} named no live process, so no CPU will be reported. ` +
        `Try: --cpu-pid="$(pgrep -f next-server | head -1)"\n`,
    );
  }

  console.log(`target        ${target}`);
  console.log(`event / form  ${eventSlug} / ${formSlug}`);
  console.log(
    `load          ${requestsPerRoute} requests per route at concurrency ${concurrency}, ` +
      `${warmupPerRoute} warmup`,
  );
  console.log(`started       ${new Date().toISOString()}\n`);

  const results: RouteResult[] = [];
  for (const route of routes) {
    results.push(await runRoute(route, sampleCpuMs));
  }

  const totalRequests = results.reduce((sum, result) => sum + result.requests, 0);

  const columns: Array<[string, number]> = [
    ['route', 18],
    ['path', 34],
    ['n', 5],
    ['rps', 8],
    ['p50', 9],
    ['p95', 9],
    ['p99', 9],
    ['max', 9],
    ['err%', 7],
    ['503/1102', 9],
  ];
  console.log(columns.map(([label, width]) => pad(label, width)).join(''));
  console.log(columns.map(([, width]) => '-'.repeat(width - 1)).join(' '));
  for (const result of results) {
    console.log(
      [
        pad(result.name, 18),
        pad(result.path, 34),
        padStart(String(result.requests), 4) + ' ',
        padStart(fixed(result.throughputPerSecond), 7) + ' ',
        padStart(fixed(result.latency.p50), 8) + ' ',
        padStart(fixed(result.latency.p95), 8) + ' ',
        padStart(fixed(result.latency.p99), 8) + ' ',
        padStart(fixed(result.latency.max), 8) + ' ',
        padStart((result.errorRate * 100).toFixed(1), 6) + ' ',
        padStart(String(result.errorCounts['cpu-limit']), 8) + ' ',
      ].join(''),
    );
  }
  console.log('\nlatencies are milliseconds to last byte, successful responses only.\n');

  for (const result of results) {
    const statuses = Object.entries(result.statusCounts)
      .map(([status, count]) => `${status}×${count}`)
      .join(' ');
    const cpu =
      result.serverCpuMsPerRequest === null
        ? ''
        : `, ${result.serverCpuMsPerRequest.toFixed(1)} ms server CPU/req`;
    console.log(`${result.name}: ${statuses}, mean body ${result.meanBytes} B${cpu}`);
    for (const note of result.notes) console.log(`  ! ${note}`);
  }

  const totalFailures = results.reduce(
    (sum, result) => sum + (result.requests - result.successes),
    0,
  );
  const totalCpuLimited = results.reduce(
    (sum, result) => sum + result.errorCounts['cpu-limit'],
    0,
  );
  console.log(
    `\noverall: ${totalRequests} requests, ${totalFailures} failed ` +
      `(${((totalFailures / totalRequests) * 100).toFixed(2)}%), ` +
      `${totalCpuLimited} of those were 503 / ${CPU_LIMIT_MARKER}.`,
  );
  const measuredCpu = results.filter((result) => result.serverCpuMsPerRequest !== null);
  if (measuredCpu.length > 0) {
    const weighted =
      measuredCpu.reduce(
        (sum, result) => sum + (result.serverCpuMsPerRequest as number) * result.requests,
        0,
      ) / measuredCpu.reduce((sum, result) => sum + result.requests, 0);
    console.log(
      `server CPU: ${weighted.toFixed(2)} ms per request across pid ${rootPids.join(', ')} ` +
        `and descendants — this host, sharing its cores with the load generator.`,
    );
  }

  if (jsonOut) {
    writeFileSync(
      jsonOut,
      `${JSON.stringify(
        {
          target,
          eventSlug,
          formSlug,
          requestsPerRoute,
          concurrency,
          warmupPerRoute,
          startedAt: new Date().toISOString(),
          results,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`wrote ${jsonOut}`);
  }

  // Fail only on a benchmark that measured nothing. Slow is a finding worth reporting, not a crash,
  // and a threshold here would tempt someone to tune the run until it passed.
  if (results.some((result) => result.successes === 0)) {
    console.error('\nat least one route never returned a successful response.');
    process.exitCode = 1;
  }
}

await main();
