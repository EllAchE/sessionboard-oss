import { describe, expect, it } from 'vitest';

import {
  analyzed,
  areaTotals,
  closedExtras,
  extrasByProject,
  loadSurvey,
  median,
  summarize,
  validate,
  type Survey,
} from './survey';
import { renderVisual } from './visual';

const survey = loadSurvey();

describe('the committed dataset', () => {
  it('is internally consistent and matches the notes on disk', () => {
    expect(validate(survey)).toEqual([]);
  });

  it('has a note, a commit, and full coverage data for every analyzed project', () => {
    const areaIds = survey.features.areas.map((a) => a.id);
    for (const project of analyzed(survey)) {
      expect(project.commit, project.slug).toBeTruthy();
      expect(Object.keys(project.coverage!).sort(), project.slug).toEqual([...areaIds].sort());
    }
  });

  it('attributes every beyond-the-brief feature to at least one analyzed project', () => {
    const slugs = new Set(analyzed(survey).map((p) => p.slug));
    for (const extra of survey.features.extras) {
      expect(extra.projects.length, extra.id).toBeGreaterThan(0);
      expect(extra.convergence, extra.id).toBe(extra.projects.length);
      for (const slug of extra.projects) expect(slugs.has(slug), `${extra.id} -> ${slug}`).toBe(true);
    }
  });

  it('counts the same attributions by row and by column', () => {
    const byRow = survey.features.extras.reduce((sum, e) => sum + e.projects.length, 0);
    const byColumn = [...extrasByProject(survey).values()].reduce((sum, list) => sum + list.length, 0);
    expect(byColumn).toBe(byRow);
  });
});

describe('validate', () => {
  const clone = (): Survey => JSON.parse(JSON.stringify(survey)) as Survey;

  it('rejects an extra attributed to an unknown project', () => {
    const broken = clone();
    broken.features.extras[0].projects = ['not-a-real-project'];
    broken.features.extras[0].convergence = 1;
    expect(validate(broken).join('\n')).toContain('not-a-real-project');
  });

  it('rejects a convergence count that disagrees with its attributions', () => {
    const broken = clone();
    broken.features.extras[0].convergence += 1;
    expect(validate(broken).join('\n')).toContain('convergence');
  });

  it('rejects a non-analyzed project with no stated reason', () => {
    const broken = clone();
    const skipped = broken.projects.find((p) => p.status !== 'analyzed')!;
    delete skipped.reason;
    expect(validate(broken).join('\n')).toContain('requires a reason');
  });

  it('rejects a coverage value outside the vocabulary', () => {
    const broken = clone();
    const project = analyzed(broken)[0];
    project.coverage![survey.features.areas[0].id] = 'excellent' as never;
    expect(validate(broken).join('\n')).toContain('excellent');
  });

  it('rejects a duplicate slug', () => {
    const broken = clone();
    broken.projects.push({ ...broken.projects[0] });
    expect(validate(broken).join('\n')).toContain('duplicate project slug');
  });

  it('rejects a closed gap that does not cite a pull request number', () => {
    const broken = clone();
    broken.features.extras[0].ciceroShipped = { pr: 0, on: '2026-08-17', note: 'shipped' };
    expect(validate(broken).join('\n')).toContain('must be a pull request number');
  });

  it('rejects a merge date that is not YYYY-MM-DD', () => {
    const broken = clone();
    broken.features.extras[0].ciceroShipped = { pr: 199, on: 'August 2026', note: 'shipped' };
    expect(validate(broken).join('\n')).toContain('must be a YYYY-MM-DD date');
  });

  it('rejects a closed gap with no note saying what Cicero does now', () => {
    const broken = clone();
    broken.features.extras[0].ciceroShipped = { pr: 199, on: '2026-08-17', note: '  ' };
    expect(validate(broken).join('\n')).toContain('needs a note');
  });
});

describe('closedExtras', () => {
  it('returns only the gaps Cicero has since closed, in catalogue order', () => {
    const closed = closedExtras(survey);
    expect(closed.length).toBeGreaterThan(0);
    for (const extra of closed) expect(extra.ciceroShipped, extra.id).toBeTruthy();
    expect(closed.map((e) => e.n)).toEqual([...closed.map((e) => e.n)].sort((a, b) => a - b));
  });

  it('leaves the catalogue itself intact — closed rows are marked, never removed', () => {
    const closed = closedExtras(survey);
    const open = survey.features.extras.filter((e) => !e.ciceroShipped);
    expect(closed.length + open.length).toBe(survey.features.extras.length);
    expect(summarize(survey).counts.extrasClosedSince).toBe(closed.length);
  });
});

describe('rollups', () => {
  it('splits every area total across exactly the analyzed projects', () => {
    const total = analyzed(survey).length;
    for (const row of areaTotals(survey)) {
      expect(row.full + row.partial + row.absent + row.unknown, row.area.id).toBe(total);
    }
  });

  it('reports a denominator that accounts for every submission found', () => {
    const { counts } = summarize(survey);
    expect(counts.analyzed + counts.sourceUnreachable + counts.noPublicSource).toBe(
      counts.submissionsFound,
    );
    expect(counts.totalFeatureRows).toBe(
      counts.baselineAreas + counts.extras + counts.ciceroDifferentiators,
    );
  });

  it('takes the median of an even-length list from the middle pair', () => {
    expect(median([4, 1, 3, 2])).toBe(3);
    expect(median([5, 1, 3])).toBe(3);
  });
});

describe('renderVisual', () => {
  const html = renderVisual(survey);

  it('emits a complete, mobile-readable HTML document linked to the submission', () => {
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<meta name="viewport"');
    expect(html).toContain('href="https://cicero-submission.elehche.workers.dev/"');
    expect(html).toContain(
      '<meta property="og:image" content="https://cicero-field-survey.elehche.workers.dev/social/cicero-card-archetypes.png">',
    );
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain('</html>');
  });

  it('emits one grid row per feature, unfiltered', () => {
    const rows = html.match(/<tr data-row="/g) ?? [];
    expect(rows.length).toBe(summarize(survey).counts.totalFeatureRows);
  });

  it('emits a column for Cicero plus every analyzed project', () => {
    const headers = html.match(/<div class="vhead">/g) ?? [];
    expect(headers.length).toBe(analyzed(survey).length + 1);
  });

  it('stays self-contained so it survives the artifact CSP', () => {
    expect(html).not.toMatch(/<(script|img)[^>]+src="https?:/);
    expect(html).not.toMatch(/<link[^>]+rel="stylesheet"[^>]+href="https?:/);
  });

  it('escapes project names into cell titles rather than interpolating raw markup', () => {
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('data-search="');
  });
});
