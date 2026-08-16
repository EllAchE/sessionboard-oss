import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const defectSchema = z.object({
  severity: z.enum(['critical', 'major', 'minor']),
  description: z.string(),
  where: z.string(),
});

const areaSchema = z.object({
  area: z.string(),
  title: z.string(),
  optional: z.boolean(),
  pct: z.number().nullable(),
  coveragePct: z.number(),
  pendingManual: z.array(z.string()),
  defects: z.array(defectSchema),
});

const reportSchema = z.object({
  targetUrl: z.string().url(),
  startedAt: z.string(),
  finishedAt: z.string(),
  kitVersion: z.string(),
  models: z.object({ agent: z.string(), judge: z.string() }),
  areas: z.array(areaSchema),
  overallPct: z.number().nullable(),
  overallCoveragePct: z.number(),
  scoreWithheld: z.boolean(),
  manualPending: z.number().int().nonnegative(),
});

type Report = z.infer<typeof reportSchema>;

export type BaselineMetadata = {
  runId: string;
  evaluatorRef?: string;
  productRef?: string;
  reportSha256: string;
};

export type SessionboardEvalBaseline = ReturnType<typeof buildBaseline>;

/** Keep only comparison data; raw evidence and fixture details stay in the evaluator checkout. */
export function buildBaseline(report: Report, metadata: BaselineMetadata) {
  return {
    schemaVersion: 1,
    provenance: {
      kind: 'scored-report' as const,
      runId: metadata.runId,
      evaluatorRef: metadata.evaluatorRef ?? null,
      productRef: metadata.productRef ?? null,
      reportSha256: metadata.reportSha256,
      sourceSessions: [] as string[],
      limitations: [] as string[],
    },
    targetUrl: report.targetUrl,
    startedAt: report.startedAt,
    finishedAt: report.finishedAt,
    kitVersion: report.kitVersion,
    models: report.models,
    score: {
      overallPct: report.overallPct,
      coveragePct: report.overallCoveragePct,
      withheld: report.scoreWithheld,
      manualPending: report.manualPending,
    },
    areas: report.areas.map((area) => ({
      area: area.area,
      title: area.title,
      optional: area.optional,
      pct: area.pct,
      coveragePct: area.coveragePct,
      pendingManual: area.pendingManual,
    })),
    defects: report.areas.flatMap((area) =>
      area.defects.map((defect) => ({ area: area.area, ...defect })),
    ),
  };
}

export function baselineFromReport(rawReport: string, metadata: Omit<BaselineMetadata, 'reportSha256'>) {
  const report = reportSchema.parse(JSON.parse(rawReport));
  return buildBaseline(report, {
    ...metadata,
    reportSha256: createHash('sha256').update(rawReport).digest('hex'),
  });
}

type ArchiveOptions = {
  runDir: string;
  evaluatorRef?: string;
  productRef?: string;
  repositoryRoot?: string;
};

export function archiveReport(options: ArchiveOptions) {
  const runDir = path.resolve(options.runDir);
  const runId = path.basename(runDir);
  if (!/^[A-Za-z0-9._-]+$/.test(runId)) {
    throw new Error(`Run directory name is not archive-safe: ${runId}`);
  }

  const reportPath = path.join(runDir, 'report.json');
  const rawReport = readFileSync(reportPath, 'utf8');
  const baseline = baselineFromReport(rawReport, {
    runId,
    evaluatorRef: options.evaluatorRef,
    productRef: options.productRef,
  });

  const repositoryRoot =
    options.repositoryRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const archiveDir = path.join(repositoryRoot, 'docs', 'evals', 'sessionboard');
  const archivePath = path.join(archiveDir, `${runId}.json`);
  const serialized = `${JSON.stringify(baseline, null, 2)}\n`;

  mkdirSync(archiveDir, { recursive: true });
  if (existsSync(archivePath)) {
    if (readFileSync(archivePath, 'utf8') !== serialized) {
      throw new Error(`Refusing to replace preserved baseline with different content: ${archivePath}`);
    }
    return { archivePath, created: false, baseline };
  }

  writeFileSync(archivePath, serialized, { flag: 'wx' });
  return { archivePath, created: true, baseline };
}

function usage() {
  return [
    'Usage: bun run eval:archive -- --run <absolute-run-dir> [options]',
    '',
    'Options:',
    '  --evaluator-ref <commit>  Evaluator revision used for the run',
    '  --product-ref <commit>    Product revision deployed at the target',
    '  --help                    Show this message',
  ].join('\n');
}

function parseArgs(argv: string[]) {
  const values: Record<string, string> = {};
  const allowed = new Set(['--run', '--evaluator-ref', '--product-ref']);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--help') return { help: true, values };
    if (!allowed.has(arg)) throw new Error(`Unknown argument: ${arg}`);

    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
    values[arg] = value;
    index += 1;
  }

  return { help: false, values };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const runDir = args.values['--run'];
  if (!runDir) throw new Error(`--run is required\n\n${usage()}`);

  const result = archiveReport({
    runDir,
    evaluatorRef: args.values['--evaluator-ref'],
    productRef: args.values['--product-ref'],
  });
  console.log(`${result.created ? 'Archived' : 'Already archived'}: ${result.archivePath}`);
  console.log(
    `Score: ${result.baseline.score.overallPct ?? 'n/a'}% over ${result.baseline.score.coveragePct}% coverage; ${result.baseline.score.manualPending} manual pending`,
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
