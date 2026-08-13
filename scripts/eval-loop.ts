import { spawn } from 'node:child_process';

/**
 * Runs the CI gates against the working tree and reports which ones hold.
 *
 * The gates are exactly the jobs in `.github/workflows/ci.yml` plus the typecheck `AGENTS.md` asks
 * for, ordered cheapest-first so a broken file is reported in seconds rather than after a full
 * production build. `--loop` keeps re-running until everything is green, which is what makes this
 * usable next to an editor: fix a failure, save, and the next pass reports it.
 */

type Gate = { name: string; command: string; args: string[] };

const GATES: Gate[] = [
  { name: 'lint', command: 'bun', args: ['run', 'lint'] },
  { name: 'typecheck', command: 'bun', args: ['run', 'typecheck'] },
  { name: 'test', command: 'bun', args: ['run', 'test'] },
  { name: 'build', command: 'bun', args: ['run', 'build'] },
];

type GateResult = { gate: Gate; ok: boolean; ms: number; output: string };

const argv = process.argv.slice(2);
const loop = argv.includes('--loop');
const keepGoing = argv.includes('--all');
const only = argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length);
const filter = argv.find((arg) => arg.startsWith('--filter='))?.slice('--filter='.length);
const delaySeconds = Number(argv.find((arg) => arg.startsWith('--delay='))?.slice('--delay='.length) ?? 5);

const selected = only
  ? GATES.filter((gate) => only.split(',').includes(gate.name))
  : GATES;

if (selected.length === 0) {
  console.error(`No gate matched --only=${only}. Known gates: ${GATES.map((g) => g.name).join(', ')}`);
  process.exit(2);
}

/** `--filter` narrows the test gate to one path, so a single suite can be iterated on quickly. */
const withFilter = (gate: Gate): Gate =>
  filter && gate.name === 'test' ? { ...gate, args: [...gate.args, filter] } : gate;

function run(gate: Gate): Promise<GateResult> {
  const startedAt = performance.now();
  return new Promise((resolve) => {
    const child = spawn(gate.command, gate.args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.on('error', (error) => {
      resolve({ gate, ok: false, ms: performance.now() - startedAt, output: String(error) });
    });
    child.on('close', (code) => {
      resolve({ gate, ok: code === 0, ms: performance.now() - startedAt, output });
    });
  });
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const tail = (output: string, lines = 40) => output.trimEnd().split('\n').slice(-lines).join('\n');
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function pass(attempt: number): Promise<GateResult[]> {
  const results: GateResult[] = [];
  console.log(`\n─── eval pass ${attempt} · ${selected.map((gate) => gate.name).join(' → ')}`);

  for (const gate of selected.map(withFilter)) {
    process.stdout.write(`  ${gate.name} … `);
    const result = await run(gate);
    results.push(result);
    console.log(result.ok ? `ok (${seconds(result.ms)})` : `FAILED (${seconds(result.ms)})`);
    // Stop at the first failure by default: a type error usually fails the build too, and the
    // second report adds nothing to the fix.
    if (!result.ok && !keepGoing) break;
  }

  return results;
}

function report(results: GateResult[]): boolean {
  const failed = results.filter((result) => !result.ok);
  const total = results.reduce((sum, result) => sum + result.ms, 0);

  if (failed.length === 0) {
    const ran = results.map((result) => result.gate.name).join(', ');
    console.log(`\n✓ ${results.length} gate(s) green in ${seconds(total)}: ${ran}`);
    return true;
  }

  for (const result of failed) {
    console.log(`\n──────── ${result.gate.name} output (last 40 lines) ────────`);
    console.log(tail(result.output));
  }
  console.log(`\n✗ ${failed.length} gate(s) failing: ${failed.map((r) => r.gate.name).join(', ')}`);
  return false;
}

let attempt = 1;
for (;;) {
  const green = report(await pass(attempt));
  if (green) {
    if (loop) console.log('Nothing left to fix; stopping the loop.');
    process.exit(0);
  }
  if (!loop) process.exit(1);

  console.log(`\nRe-running in ${delaySeconds}s — fix a gate above and save. Ctrl-C to stop.`);
  await wait(delaySeconds * 1000);
  attempt += 1;
}
