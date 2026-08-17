import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { archiveReport, baselineFromReport } from './archive-sessionboard-eval';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function report(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    targetUrl: 'https://cicero.example.test',
    startedAt: '2026-08-16T20:25:39.000Z',
    finishedAt: '2026-08-16T21:25:39.000Z',
    kitVersion: '1.2.3',
    models: { agent: 'harness', judge: 'codex' },
    overallPct: 91.2,
    overallCoveragePct: 98.4,
    scoreWithheld: false,
    manualPending: 2,
    areas: [
      {
        area: 'call-for-papers',
        title: 'Call for Papers',
        optional: false,
        pct: 91.2,
        coveragePct: 98.4,
        pendingManual: ['CFP-R9'],
        defects: [
          {
            severity: 'major',
            description: 'Confirmation copy was absent.',
            where: '/submit/done',
          },
        ],
        items: [{ reasoning: 'fixture@example.com should not enter the archive' }],
        scenarios: [{ secret: 'raw evidence stays outside the product repo' }],
      },
    ],
    ...overrides,
  });
}

describe('Sessionboard eval baseline archive', () => {
  it('keeps score and defects while dropping evidence detail', () => {
    const rawReport = report();
    const baseline = baselineFromReport(rawReport, {
      runId: '2026-08-16T20-25-39',
      evaluatorRef: 'eval-sha',
      productRef: 'product-sha',
    });

    expect(baseline.score).toEqual({
      overallPct: 91.2,
      coveragePct: 98.4,
      withheld: false,
      manualPending: 2,
    });
    expect(baseline.defects).toEqual([
      {
        area: 'call-for-papers',
        severity: 'major',
        description: 'Confirmation copy was absent.',
        where: '/submit/done',
      },
    ]);
    expect(baseline.provenance.reportSha256).toBe(
      createHash('sha256').update(rawReport).digest('hex'),
    );
    expect(JSON.stringify(baseline)).not.toContain('fixture@example.com');
    expect(JSON.stringify(baseline)).not.toContain('raw evidence');
  });

  it('is idempotent and refuses to rewrite a run with different report content', () => {
    const repositoryRoot = mkdtempSync(path.join(tmpdir(), 'cicero-eval-repo-'));
    const runDir = path.join(repositoryRoot, 'external', 'runs', '2026-08-16T20-25-39');
    temporaryDirectories.push(repositoryRoot);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(path.join(runDir, 'report.json'), report());

    const first = archiveReport({ runDir, repositoryRoot });
    const second = archiveReport({ runDir, repositoryRoot });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(JSON.parse(readFileSync(first.archivePath, 'utf8')).score.overallPct).toBe(91.2);

    writeFileSync(path.join(runDir, 'report.json'), report({ overallPct: 72 }));
    expect(() => archiveReport({ runDir, repositoryRoot })).toThrow(
      'Refusing to replace preserved baseline',
    );
  });
});
