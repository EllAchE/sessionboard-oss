# Performance benchmark

`Z-4`. What the five public entry points cost, measured rather than asserted.

`scripts/benchmark.ts` is a closed-loop HTTP benchmark with no dependencies beyond the runtime —
`fetch`, `performance.now()` and a fixed pool of workers. Run it with `bun run bench`. It is
deliberately **not** wired into CI: it takes minutes, it is sensitive to whatever else the machine is
doing, and a load test gating every pull request becomes a flaky check people learn to re-run rather
than read.

## What it measures

Five routes — the same five the requirements audit health-checks:

| Route | Path against the seeded demo event |
| --- | --- |
| Home | `/` |
| Event page | `/demo` |
| Public programme | `/demo/agenda` |
| Call for speakers | `/submit/demo/speak` |
| Agenda API | `/api/v1/events/demo/agenda` |

All five are `ƒ` in the build output — server-rendered on demand, no prerendered shell — so these are
render costs, not static file serving.

Per route it issues a warmup burst, then a fixed number of requests across a fixed pool of concurrent
workers, and reports min / mean / p50 / p90 / p95 / p99 / max latency, throughput, the full HTTP
status distribution and the error rate.

Three details change what the numbers mean:

- **Latency is time to the last byte of the response body**, not time to first byte. A server that
  flushes headers instantly and then stalls on a query is not fast, and TTFB would hide that.
- **HTTP 503 and Cloudflare's `error code: 1102` are counted apart from every other failure.** That
  pair is how a Workers free-plan deployment fails when a render exceeds the 10ms CPU cap, which is
  the one failure mode the README already documents. Folding it into a general error rate would
  discard the number most worth knowing about the demo deployment.
- **`--cpu-pid=<pid>[,<pid>…]` samples `/proc` for CPU consumed by a local server process and its
  descendants**, before and after each route's measured window, with warmup excluded. Wall-clock
  latency says nothing about CPU — a route can be slow because Postgres is slow and still cost 2ms of
  CPU — and the free-plan ceiling is a CPU ceiling, so this is the measurement that speaks to it. It
  takes a list because `wrangler dev` runs two sibling `workerd` processes under a supervisor whose
  own CPU should not be billed to the app.

## Running it

```sh
bun run bench                                             # http://localhost:3000, demo/speak
bun run bench -- --target=https://cicero.example.dev      # any deployment
bun run bench -- --event=first-settlement --form=motions  # a different seeded event
bun run bench -- --requests=500 --concurrency=16 --json=bench.json
```

Every flag also reads an environment variable (`CICERO_BENCH_TARGET`, `CICERO_BENCH_REQUESTS`,
`CICERO_BENCH_CONCURRENCY`, `CICERO_BENCH_WARMUP`, `CICERO_BENCH_TIMEOUT`, `CICERO_BENCH_EVENT`,
`CICERO_BENCH_FORM`, `CICERO_BENCH_CPU_PID`, `CICERO_BENCH_JSON`). Defaults: `http://localhost:3000`,
200 requests per route, concurrency 8, 10 warmup requests, 20s timeout.

The script exits non-zero only when a route never returned a single successful response. Slow is a
finding to report, not a crash, and a pass/fail threshold here would invite tuning the run until it
went green.

## Captured results

### Conditions

| | |
| --- | --- |
| Revision measured | `73d2e02` plus this branch's changes. `main` moves quickly; commits merged after that base are not in these numbers. |
| Date | 2026-08-13 |
| Data | `bun run db:seed` demo event: 14 submissions, 7 speakers, 5 scheduled sessions |
| Database | PostgreSQL 15.18 on the same machine, over TCP to `127.0.0.1:5432` |
| Hardware | 4 vCPU Intel Xeon @ 2.20GHz (2 cores × 2 threads), 15GB RAM, Debian 12, kernel 6.1 |
| Runtime | Node v24.18.0, Next.js 15.5.23, `workerd` via wrangler 4.x |
| Load generator | `scripts/benchmark.ts`, on the same machine as the server |

Three limits on what these numbers can be used for. They are stated first because they matter more
than the tables.

**The deployed Worker at `cicero.elehche.workers.dev` was not measured during this benchmark.** The
original run targeted an incorrect Workers account subdomain, so its DNS failure says nothing about
the live deployment. The corrected host was health-checked separately, but there are still no
deployed latency numbers here and none have been extrapolated from the local ones. The free-plan
`error code: 1102` behaviour the README describes remains, as far as this document is concerned, an
unmeasured production observation rather than something reproduced by this run. What follows says
something about how much CPU the app needs; it says nothing directly about how Cloudflare meters it.

**The benchmarking machine was busy and shared.** Load average sat between 3 and 5 on four cores
throughout, from unrelated work, and the load generator itself competes with the server and with
Postgres. Every run below is therefore repeated — five times at concurrency 1, three times at
concurrency 8, three times under `workerd` — and the tables report the **median across runs**, with
the observed p50 spread in the last column so the noise is visible rather than hidden. Throughput
figures are a lower bound. Latency is the noisiest metric here; CPU per request is the steadiest,
because it measures what the server itself burned rather than how long it waited for a core.

### `next start`, one request at a time

The production Node server, the same one `docker compose up` runs. 100 requests per route,
concurrency 1, 15 warmup, ×5 runs. Milliseconds to last byte, median of the five runs.

| Route | req/s | p50 | p95 | p99 | max | CPU/req | p50 across runs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | 23.1 | 40.9 | 63.9 | 81.5 | 88.7 | 29.2 ms | 28.6–48.3 |
| `/demo` | 16.6 | 58.3 | 101.7 | 114.0 | 134.0 | 46.4 ms | 45.3–84.9 |
| `/demo/agenda` | 15.9 | 55.8 | 96.0 | 100.0 | 110.2 | 41.8 ms | 42.5–58.1 |
| `/submit/demo/speak` | 23.4 | 41.4 | 62.3 | 68.0 | 84.0 | 31.3 ms | 29.0–47.9 |
| `/api/v1/events/demo/agenda` | 71.9 | 12.9 | 21.9 | 29.7 | 33.0 | 8.2 ms | 11.5–14.3 |

**2500 requests, 0 failures, 0 responses that were 503 or carried `error code: 1102`.** HTTP 200 on
every one. Weighted mean 33.9ms of server CPU per request.

### `next start`, eight concurrent clients

200 requests per route, concurrency 8, 15 warmup, ×3 runs.

| Route | req/s | p50 | p95 | p99 | max | CPU/req | p50 across runs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | 37.7 | 210.0 | 259.2 | 404.1 | 410.2 | 25.6 ms | 165.2–239.2 |
| `/demo` | 25.5 | 305.1 | 431.9 | 480.2 | 492.3 | 37.0 ms | 241.3–307.5 |
| `/demo/agenda` | 29.9 | 257.6 | 338.4 | 543.6 | 552.6 | 35.8 ms | 203.5–277.7 |
| `/submit/demo/speak` | 41.3 | 189.5 | 265.3 | 332.0 | 355.4 | 24.7 ms | 169.2–205.3 |
| `/api/v1/events/demo/agenda` | 144.2 | 53.8 | 77.9 | 95.6 | 103.9 | 6.8 ms | 53.7–57.5 |

**3000 requests, 0 failures, 0 of them 503 / `error code: 1102`.** Weighted mean 25.5ms of server CPU
per request.

Latency rises roughly in proportion to concurrency while throughput stays flat — what a CPU-saturated
four-core box looks like. Nothing queued pathologically and nothing timed out.

Decoded response sizes: `/` 71.6 kB, `/demo` 51.2 kB, `/demo/agenda` 45.1 kB, `/submit/demo/speak`
38.9 kB, agenda API 4.3 kB.

### Local `workerd`, one request at a time

The OpenNext bundle (`bun run cf:build`) served by `wrangler dev` on `localhost:8787` with the local
Hyperdrive binding. 100 requests per route, concurrency 1, 15 warmup, ×3 runs. This is the same
JavaScript runtime the deployment uses, so it is the closest reading available here of what the
Worker's code actually costs.

**It is not the deployed Worker and must not be read as one.** `wrangler dev` is a development
server: request tracing is on, assets come off local disk, there is no CDN in front, and no CPU limit
is enforced. Every number below is inflated by that. Wrangler's own local observability spans report
`cpu_time_ms` as 0, so they cannot be used instead.

| Route | req/s | p50 | p95 | p99 | max | CPU/req | p50 across runs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | 26.4 | 34.4 | 51.5 | 78.7 | 146.8 | 42.5 ms | 31.5–50.6 |
| `/demo` | 13.5 | 69.2 | 99.2 | 125.6 | 151.5 | 65.2 ms | 65.8–84.4 |
| `/demo/agenda` | 15.1 | 62.0 | 86.8 | 123.7 | 236.0 | 59.6 ms | 61.6–74.6 |
| `/submit/demo/speak` | 17.4 | 51.3 | 85.6 | 112.2 | 209.9 | 54.4 ms | 50.6–60.4 |
| `/api/v1/events/demo/agenda` | 31.4 | 29.8 | 41.0 | 46.4 | 48.7 | 21.3 ms | 29.5–30.4 |

**1500 requests, 0 failures, 0 of them 503 / `error code: 1102`.** Weighted mean 49.6ms of CPU per
request across both `workerd` processes.

## What the numbers say

**The self-hosted target is fast and does not fail.** Median p50 between 41 and 58ms on the
server-rendered pages, 12.9ms on the API, and a zero error rate across 7000 requests with no 503
anywhere. `docker compose up` on a busy commodity box serves the public pages comfortably.

**Server-rendered pages cost 29–46ms of CPU each; the JSON API costs 8ms.** This is the finding that
bears on the README's free-plan caveat. The Workers free plan allows 10ms of CPU per request. Taking
the *lowest* reading on this page — the Node server under concurrency, on a slow shared vCPU — the
public HTML routes still spend two to four times the free-plan budget on rendering alone, before any
of Cloudflare's own overhead. Under `workerd` the same routes read higher again. The exact multiplier
is not transferable to production hardware, but the sign is not in doubt, and it is not the kind of
gap a faster machine closes.

So the README's account of why `error code: 1102` happens — "nothing in the code can render an admin
table in 10ms of CPU" — is consistent with what this benchmark measures on the pages that are *not*
admin tables. It is a plan limit, and the fix stays the one the README names: Workers Paid, or any
host without a CPU quota.

The API route is the interesting exception at 7–8ms of CPU under Node, just under the free-plan
ceiling. That matches the audit's observation that the API health-check passes while navigation is
what intermittently 503s.

**Nothing here was tuned to look good.** No caching headers were added for the run, no route was
dropped for being slow, the runs were taken on a machine under real contention rather than waiting
for a quiet one, and the `workerd` numbers are reported despite being the least flattering set on the
page.

## Reproducing

```sh
# One terminal: a production server against a seeded database
cp .env.example .env
docker compose up postgres -d
bun run db:migrate && bun run db:seed
bun run build && bun run start

# Another: the benchmark, with CPU accounting pointed at the server process.
# Note `pgrep -f next-server` also matches the shell running it; match on comm instead.
PID=$(ps -eo pid,comm --no-headers | awk '$2=="next-server" {print $1}')
bun run bench -- --requests=100 --concurrency=1 --warmup=15 --cpu-pid="$PID"
bun run bench -- --requests=200 --concurrency=8 --warmup=15 --cpu-pid="$PID"

# The workerd reading, if you want it
bun run cf:build && bun run cf:preview
bun run bench -- --target=http://localhost:8787 --requests=100 --concurrency=1 --warmup=15 \
  --cpu-pid="$(ps -eo pid,comm --no-headers | awk '$2=="workerd" {print $1}' | paste -sd,)"
```

Repeat each configuration a few times and compare medians; a single run on a shared machine is a
sample of the machine, not of the app. Numbers from different hardware will differ. The shape — the
API an order of magnitude cheaper than the HTML routes, and the HTML routes well above 10ms of CPU —
is the part expected to hold.
