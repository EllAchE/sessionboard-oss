/**
 * Data model, loader and validator for the alternative-designs survey.
 *
 * Two hand-maintained files are the source of truth:
 *   docs/alternatives/data/projects.json  — every submission found, and what we know about it
 *   docs/alternatives/data/features.json  — the feature catalog and its per-project attributions
 *
 * Everything else in docs/alternatives/ is either narrative prose (the per-project notes) or
 * generated (the README matrix, survey.json, the visual). See
 * .agents/skills/survey-alternative-designs/SKILL.md for the process that produces them.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const REPO_ROOT = join(import.meta.dirname, '..', '..');
export const ALTERNATIVES_DIR = join(REPO_ROOT, 'docs', 'alternatives');
export const DATA_DIR = join(ALTERNATIVES_DIR, 'data');

/** Files in docs/alternatives/ that are not per-project notes. */
const NON_PROJECT_NOTES = new Set(['README.md', 'discovery-log.md', 'feature-matrix.md']);

export const COVERAGE_VALUES = ['full', 'partial', 'absent', 'unknown'] as const;
export type Coverage = (typeof COVERAGE_VALUES)[number];

/** How the symbols in the generated markdown map onto coverage values. */
export const COVERAGE_SYMBOL: Record<Coverage, string> = {
  full: '✓',
  partial: '~',
  absent: '✗',
  unknown: '?',
};

export const PROJECT_STATUSES = ['analyzed', 'source-unreachable', 'no-public-source'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface Stack {
  language: string;
  framework: string;
  datastore: string;
  dataAccess: string;
  hosting: string;
  auth: string[];
}

export interface Scale {
  lines: number;
  files: number;
  commits: number;
  /** True when the clone was shallow, so `commits` is a floor rather than the real count. */
  commitsAreLowerBound: boolean;
  authors: number;
  firstCommit: string;
  lastCommit: string;
}

export interface Project {
  slug: string;
  project: string;
  status: ProjectStatus;
  source: string | null;
  live: string | null;
  foundVia: string;
  /** Present only when status is `analyzed`. */
  analyzedOn?: string;
  commit?: string;
  note?: string;
  stack?: Stack;
  stackProse?: string;
  scale?: Scale;
  coverage?: Record<string, Coverage>;
  /** Present only when status is not `analyzed`: why no code was read. */
  reason?: string;
}

export interface Area {
  id: string;
  label: string;
  description: string;
}

/**
 * An extra the survey recorded as absent from Cicero and Cicero has built since. The row stays in
 * the catalogue — deleting it would erase both the attribution and the evidence that the field
 * arrived at the gap first — so this is how "no longer true of Cicero" gets said out loud.
 */
export interface CiceroShipped {
  /** The pull request that closed the gap. */
  pr: number;
  /** The date it merged, `YYYY-MM-DD`. */
  on: string;
  /** What Cicero does now, and where in source to read it. */
  note: string;
}

export interface Extra {
  id: string;
  n: number;
  title: string;
  description: string;
  convergence: number;
  tier: string;
  projects: string[];
  /** Present only once Cicero has shipped it; absent means the gap is still open. */
  ciceroShipped?: CiceroShipped;
}

export interface CiceroDifferentiator {
  id: string;
  title: string;
  absentIn: number;
  of: number;
  /** When the capability maps onto a baseline area, per-project values come from coverage. */
  derivedFromArea?: string;
}

export interface Features {
  areas: Area[];
  extras: Extra[];
  ciceroDifferentiators: CiceroDifferentiator[];
}

export interface Survey {
  surveyedOn: string;
  brief: string;
  projects: Project[];
  features: Features;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function loadSurvey(dataDir = DATA_DIR): Survey {
  const projectsDoc = readJson<{ surveyedOn: string; brief: string; projects: Project[] }>(
    join(dataDir, 'projects.json'),
  );
  const features = readJson<Features>(join(dataDir, 'features.json'));
  return {
    surveyedOn: projectsDoc.surveyedOn,
    brief: projectsDoc.brief,
    projects: projectsDoc.projects,
    features,
  };
}

export function analyzed(survey: Survey): Project[] {
  return survey.projects
    .filter((p) => p.status === 'analyzed')
    .sort((a, b) => a.slug.toLowerCase().localeCompare(b.slug.toLowerCase()));
}

/**
 * Every invariant the dataset has to hold. Returns human-readable problems; an empty array means
 * the data is internally consistent and consistent with the notes on disk.
 */
export function validate(survey: Survey, alternativesDir = ALTERNATIVES_DIR): string[] {
  const problems: string[] = [];
  const bySlug = new Map<string, Project>();

  for (const project of survey.projects) {
    if (bySlug.has(project.slug)) problems.push(`duplicate project slug: ${project.slug}`);
    bySlug.set(project.slug, project);
    if (!PROJECT_STATUSES.includes(project.status)) {
      problems.push(`${project.slug}: unknown status "${project.status}"`);
    }
    if (project.status !== 'analyzed' && !project.reason) {
      problems.push(`${project.slug}: status "${project.status}" requires a reason`);
    }
  }

  const areaIds = survey.features.areas.map((a) => a.id);

  for (const project of analyzed(survey)) {
    const notePath = join(alternativesDir, `${project.slug}.md`);
    if (!existsSync(notePath)) {
      problems.push(`${project.slug}: analyzed but docs/alternatives/${project.slug}.md is missing`);
    }
    if (!project.commit) problems.push(`${project.slug}: analyzed but has no commit`);
    if (!project.scale) problems.push(`${project.slug}: analyzed but has no scale`);
    if (!project.stack) problems.push(`${project.slug}: analyzed but has no stack`);

    const coverage = project.coverage ?? {};
    for (const areaId of areaIds) {
      const value = coverage[areaId];
      if (value === undefined) {
        problems.push(`${project.slug}: coverage is missing area "${areaId}"`);
      } else if (!COVERAGE_VALUES.includes(value)) {
        problems.push(`${project.slug}: coverage.${areaId} has invalid value "${value}"`);
      }
    }
    for (const areaId of Object.keys(coverage)) {
      if (!areaIds.includes(areaId)) {
        problems.push(`${project.slug}: coverage names unknown area "${areaId}"`);
      }
    }
  }

  // Every note on disk must be accounted for, so a hand-written file cannot go uncounted.
  if (existsSync(alternativesDir)) {
    for (const file of readdirSync(alternativesDir)) {
      if (!file.endsWith('.md') || NON_PROJECT_NOTES.has(file)) continue;
      const slug = file.slice(0, -3);
      const project = bySlug.get(slug);
      if (!project) {
        problems.push(`docs/alternatives/${file} has no entry in projects.json`);
      } else if (project.status !== 'analyzed') {
        problems.push(`docs/alternatives/${file} exists but ${slug} is not marked analyzed`);
      }
    }
  }

  const analyzedSlugs = new Set(analyzed(survey).map((p) => p.slug));
  const seenExtraIds = new Set<string>();
  for (const extra of survey.features.extras) {
    if (seenExtraIds.has(extra.id)) problems.push(`duplicate extra id: ${extra.id}`);
    seenExtraIds.add(extra.id);
    if (extra.projects.length === 0) {
      problems.push(`${extra.id} "${extra.title}" has no attributed project`);
    }
    if (extra.convergence !== extra.projects.length) {
      problems.push(
        `${extra.id}: convergence ${extra.convergence} does not match ${extra.projects.length} attributed projects`,
      );
    }
    for (const slug of extra.projects) {
      if (!analyzedSlugs.has(slug)) {
        problems.push(`${extra.id} is attributed to "${slug}", which is not an analyzed project`);
      }
    }
    const shipped = extra.ciceroShipped;
    if (shipped) {
      if (!Number.isInteger(shipped.pr) || shipped.pr <= 0) {
        problems.push(`${extra.id}: ciceroShipped.pr must be a pull request number`);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(shipped.on)) {
        problems.push(`${extra.id}: ciceroShipped.on must be a YYYY-MM-DD date`);
      }
      if (!shipped.note?.trim()) {
        problems.push(`${extra.id}: ciceroShipped needs a note saying what Cicero does now`);
      }
    }
  }

  for (const differentiator of survey.features.ciceroDifferentiators) {
    if (differentiator.absentIn > differentiator.of) {
      problems.push(`${differentiator.id}: absentIn exceeds the analyzed total`);
    }
    if (differentiator.of !== analyzedSlugs.size) {
      problems.push(
        `${differentiator.id}: counted against ${differentiator.of} projects but ${analyzedSlugs.size} were analyzed`,
      );
    }
    if (differentiator.derivedFromArea && !areaIds.includes(differentiator.derivedFromArea)) {
      problems.push(`${differentiator.id}: derivedFromArea "${differentiator.derivedFromArea}" is not an area`);
    }
  }

  return problems;
}

export interface AreaTotals {
  area: Area;
  full: number;
  partial: number;
  absent: number;
  unknown: number;
}

export function areaTotals(survey: Survey): AreaTotals[] {
  const projects = analyzed(survey);
  return survey.features.areas.map((area) => {
    const totals: AreaTotals = { area, full: 0, partial: 0, absent: 0, unknown: 0 };
    for (const project of projects) totals[project.coverage?.[area.id] ?? 'unknown'] += 1;
    return totals;
  });
}

/** The extras Cicero has built since the field was read, in catalogue order. */
export function closedExtras(survey: Survey): Extra[] {
  return survey.features.extras.filter((e) => e.ciceroShipped).sort((a, b) => a.n - b.n);
}

/** Extras attributed to a project, so the grid can be read by column as well as by row. */
export function extrasByProject(survey: Survey): Map<string, Extra[]> {
  const byProject = new Map<string, Extra[]>();
  for (const project of analyzed(survey)) byProject.set(project.slug, []);
  for (const extra of survey.features.extras) {
    for (const slug of extra.projects) byProject.get(slug)?.push(extra);
  }
  return byProject;
}

function tally<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[middle - 1] + sorted[middle]) / 2) : sorted[middle];
}

/** The derived rollup written to survey.json — nothing here is authored by hand. */
export function summarize(survey: Survey) {
  const projects = analyzed(survey);
  const counts = tally(survey.projects, (p) => p.status);
  const scales = projects.map((p) => p.scale!);
  const extrasPerProject = extrasByProject(survey);
  const dates = projects.flatMap((p) => [p.scale!.firstCommit, p.scale!.lastCommit]).sort();

  return {
    generated: 'by scripts/alternatives/build.ts — do not edit',
    surveyedOn: survey.surveyedOn,
    brief: survey.brief,
    counts: {
      submissionsFound: survey.projects.length,
      analyzed: counts.analyzed ?? 0,
      sourceUnreachable: counts['source-unreachable'] ?? 0,
      noPublicSource: counts['no-public-source'] ?? 0,
      baselineAreas: survey.features.areas.length,
      extras: survey.features.extras.length,
      extrasClosedSince: closedExtras(survey).length,
      ciceroDifferentiators: survey.features.ciceroDifferentiators.length,
      totalFeatureRows:
        survey.features.areas.length +
        survey.features.extras.length +
        survey.features.ciceroDifferentiators.length,
      attributions: survey.features.extras.reduce((sum, e) => sum + e.projects.length, 0),
    },
    scale: {
      lines: { min: Math.min(...scales.map((s) => s.lines)), max: Math.max(...scales.map((s) => s.lines)), median: median(scales.map((s) => s.lines)) },
      files: { min: Math.min(...scales.map((s) => s.files)), max: Math.max(...scales.map((s) => s.files)), median: median(scales.map((s) => s.files)) },
      authors: { min: Math.min(...scales.map((s) => s.authors)), max: Math.max(...scales.map((s) => s.authors)) },
      firstCommit: dates[0],
      lastCommit: dates[dates.length - 1],
    },
    stack: {
      language: tally(projects, (p) => p.stack!.language),
      framework: tally(projects, (p) => p.stack!.framework),
      datastore: tally(projects, (p) => p.stack!.datastore),
      dataAccess: tally(projects, (p) => p.stack!.dataAccess),
      hosting: tally(projects, (p) => p.stack!.hosting),
      auth: tally(
        projects.flatMap((p) => p.stack!.auth.map((a) => ({ a }))),
        (x) => x.a,
      ),
    },
    areaTotals: areaTotals(survey).map((t) => ({
      area: t.area.id,
      label: t.area.label,
      full: t.full,
      partial: t.partial,
      absent: t.absent,
      unknown: t.unknown,
    })),
    extrasByConvergence: [...survey.features.extras]
      .sort((a, b) => b.convergence - a.convergence || a.n - b.n)
      .map((e) => ({
        id: e.id,
        title: e.title,
        convergence: e.convergence,
        projects: e.projects,
        ciceroShipped: e.ciceroShipped ?? null,
      })),
    extrasPerProject: Object.fromEntries(
      [...extrasPerProject.entries()]
        .map(([slug, extras]) => [slug, extras.map((e) => e.id)] as const)
        .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])),
    ),
  };
}
