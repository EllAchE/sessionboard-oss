/**
 * Renders the survey as a single self-contained HTML page: the full feature grid, every feature
 * against every analyzed project, plus the rollups that put it in context.
 *
 * No external requests — the page is published as an Artifact under a CSP that blocks them, and it
 * has to open straight from disk too. Everything is inline.
 */

import { analyzed, areaTotals, extrasByProject, summarize, type Coverage, type Survey } from './survey';

type Cell = { value: Coverage; title: string };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const CSS = `
:root {
  color-scheme: light dark;
  --ground: #f2f5f4;
  --panel: #ffffff;
  --panel-sunk: #eaefee;
  --ink: #16211f;
  --ink-muted: #5c6b68;
  --ink-faint: #849490;
  --rule: #dbe2e0;
  --rule-strong: #c2ccc9;
  --accent: #0f5f52;
  --accent-soft: #d7e8e3;
  --full: #2e7d6b;
  --full-bg: #d3e7e1;
  --partial: #9a6f1c;
  --partial-bg: #f0e2c4;
  --absent: #aab6b3;
  --absent-bg: #e6eae9;
  --unknown: #9aa8a4;
  --cicero: #7a4f12;
  --cicero-bg: #f6ecd9;
  --shadow: 0 1px 2px rgba(22, 33, 31, 0.06), 0 8px 24px -16px rgba(22, 33, 31, 0.4);
  --serif: ui-serif, Spectral, Georgia, "Times New Roman", serif;
  --sans: system-ui, -apple-system, "Segoe UI", Archivo, Helvetica, Arial, sans-serif;
  --mono: ui-monospace, "IBM Plex Mono", "SF Mono", Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --ground: #0d1312;
    --panel: #141c1b;
    --panel-sunk: #101817;
    --ink: #e6ecea;
    --ink-muted: #97a6a2;
    --ink-faint: #6f7d79;
    --rule: #24312f;
    --rule-strong: #35443f;
    --accent: #5cbfa6;
    --accent-soft: #16302b;
    --full: #4fb89c;
    --full-bg: #143029;
    --partial: #d3a44b;
    --partial-bg: #33280f;
    --absent: #46534f;
    --absent-bg: #19211f;
    --unknown: #5b6663;
    --cicero: #dfae63;
    --cicero-bg: #2b2211;
    --shadow: 0 1px 2px rgba(0, 0, 0, 0.5), 0 8px 24px -16px rgba(0, 0, 0, 0.9);
  }
}
:root[data-theme="light"] {
  --ground: #f2f5f4; --panel: #ffffff; --panel-sunk: #eaefee; --ink: #16211f; --ink-muted: #5c6b68;
  --ink-faint: #849490; --rule: #dbe2e0; --rule-strong: #c2ccc9; --accent: #0f5f52;
  --accent-soft: #d7e8e3; --full: #2e7d6b; --full-bg: #d3e7e1; --partial: #9a6f1c;
  --partial-bg: #f0e2c4; --absent: #aab6b3; --absent-bg: #e6eae9; --unknown: #9aa8a4;
  --cicero: #7a4f12; --cicero-bg: #f6ecd9;
  --shadow: 0 1px 2px rgba(22, 33, 31, 0.06), 0 8px 24px -16px rgba(22, 33, 31, 0.4);
}
:root[data-theme="dark"] {
  --ground: #0d1312; --panel: #141c1b; --panel-sunk: #101817; --ink: #e6ecea; --ink-muted: #97a6a2;
  --ink-faint: #6f7d79; --rule: #24312f; --rule-strong: #35443f; --accent: #5cbfa6;
  --accent-soft: #16302b; --full: #4fb89c; --full-bg: #143029; --partial: #d3a44b;
  --partial-bg: #33280f; --absent: #46534f; --absent-bg: #19211f; --unknown: #5b6663;
  --cicero: #dfae63; --cicero-bg: #2b2211;
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.5), 0 8px 24px -16px rgba(0, 0, 0, 0.9);
}

body {
  margin: 0;
  background: var(--ground);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 15px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
.wrap { max-width: 1500px; margin: 0 auto; padding: 48px 24px 96px; display: flex; flex-direction: column; gap: 40px; }
h1, h2, h3 { font-family: var(--serif); font-weight: 600; text-wrap: balance; margin: 0; letter-spacing: -0.01em; }
h1 { font-size: clamp(30px, 4.4vw, 46px); line-height: 1.1; }
h2 { font-size: clamp(21px, 2.4vw, 27px); }
h3 { font-size: 17px; }
p { margin: 0; max-width: 74ch; }
a { color: var(--accent); text-underline-offset: 2px; }
.eyebrow {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--ink-faint); margin: 0;
}
.lede { color: var(--ink-muted); font-size: 17px; }
.muted { color: var(--ink-muted); }
.small { font-size: 13px; }

header.masthead { display: flex; flex-direction: column; gap: 14px; border-bottom: 2px solid var(--rule-strong); padding-bottom: 28px; }

.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(132px, 1fr)); gap: 1px; background: var(--rule); border: 1px solid var(--rule); border-radius: 3px; overflow: hidden; }
.stat { background: var(--panel); padding: 14px 16px; display: flex; flex-direction: column; gap: 2px; }
.stat b { font-family: var(--mono); font-size: 26px; font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1.1; }
.stat span { font-size: 11px; font-family: var(--mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-faint); }

section { display: flex; flex-direction: column; gap: 16px; }
.section-head { display: flex; flex-direction: column; gap: 6px; }

.controls { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.controls input {
  font: inherit; font-size: 14px; padding: 7px 11px; border: 1px solid var(--rule-strong);
  border-radius: 3px; background: var(--panel); color: var(--ink); min-width: 260px;
}
.controls input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.controls button {
  font: inherit; font-size: 13px; font-family: var(--mono); padding: 7px 12px; cursor: pointer;
  border: 1px solid var(--rule-strong); border-radius: 3px; background: var(--panel); color: var(--ink-muted);
}
.controls button[aria-pressed="true"] { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
.controls button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

.legend { display: flex; flex-wrap: wrap; gap: 6px 20px; font-size: 12.5px; color: var(--ink-muted); }
.legend span { display: inline-flex; align-items: center; gap: 7px; }
.key { width: 17px; height: 17px; border-radius: 2px; display: grid; place-items: center; font-family: var(--mono); font-size: 11px; font-weight: 600; }
.key.full { background: var(--full-bg); color: var(--full); }
.key.partial { background: var(--partial-bg); color: var(--partial); }
.key.absent { background: var(--absent-bg); color: var(--absent); }
.key.unknown { background: transparent; color: var(--unknown); border: 1px dashed var(--rule-strong); }

.gridbox { overflow: auto; max-height: 82vh; border: 1px solid var(--rule-strong); border-radius: 3px; background: var(--panel); box-shadow: var(--shadow); }
table.grid { border-collapse: separate; border-spacing: 0; font-family: var(--mono); font-size: 12px; }
table.grid th, table.grid td { border-right: 1px solid var(--rule); border-bottom: 1px solid var(--rule); }

table.grid thead th { position: sticky; top: 0; z-index: 3; background: var(--panel-sunk); vertical-align: bottom; padding: 0; }
table.grid thead th.corner { left: 0; z-index: 5; background: var(--panel-sunk); text-align: left; vertical-align: bottom; padding: 10px 12px; min-width: 340px; max-width: 340px; }
table.grid thead th.corner .corner-label { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-faint); }
.vhead { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; padding: 10px 5px; height: 172px; font-weight: 500; color: var(--ink-muted); font-size: 11.5px; }
th.col-cicero { background: var(--cicero-bg) !important; }
th.col-cicero .vhead { color: var(--cicero); font-weight: 700; }

table.grid tbody th.rowhead {
  position: sticky; left: 0; z-index: 2; background: var(--panel); text-align: left; font-weight: 400;
  padding: 5px 12px; min-width: 340px; max-width: 340px; font-family: var(--sans); font-size: 12.5px;
  line-height: 1.35; cursor: pointer; border-right: 1px solid var(--rule-strong);
}
tbody th.rowhead .fid { font-family: var(--mono); font-size: 10.5px; color: var(--ink-faint); margin-right: 7px; }
tbody tr:hover th.rowhead, tbody tr:hover td { background: var(--panel-sunk); }
tbody tr[aria-selected="true"] th.rowhead, tbody tr[aria-selected="true"] td { background: var(--accent-soft); }
tbody th.rowhead:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }

td.cell { text-align: center; width: 27px; min-width: 27px; padding: 0; height: 25px; font-weight: 600; font-size: 12px; }
td.full { color: var(--full); background: var(--full-bg); }
td.partial { color: var(--partial); background: var(--partial-bg); }
td.absent { color: var(--absent); background: var(--absent-bg); }
td.unknown { color: var(--unknown); }
td.cell.cicero-col { box-shadow: inset 2px 0 0 var(--cicero), inset -2px 0 0 var(--cicero); }

tr.band th, tr.band td { background: var(--ground); }
tr.band th {
  position: sticky; left: 0; z-index: 2; text-align: left; padding: 12px 12px 6px; font-family: var(--sans);
  font-size: 11px; letter-spacing: 0.11em; text-transform: uppercase; color: var(--accent); font-weight: 600;
  border-top: 2px solid var(--rule-strong); background: var(--ground);
}
tr.hidden { display: none; }

.detail { border: 1px solid var(--rule-strong); border-left: 3px solid var(--accent); border-radius: 3px; background: var(--panel); padding: 18px 20px; display: flex; flex-direction: column; gap: 10px; min-height: 96px; }
.detail .chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { font-family: var(--mono); font-size: 11.5px; padding: 3px 8px; border-radius: 2px; background: var(--panel-sunk); border: 1px solid var(--rule); color: var(--ink-muted); }

.panels { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; }
.card { border: 1px solid var(--rule); border-radius: 3px; background: var(--panel); padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; box-shadow: var(--shadow); }

.bars { display: flex; flex-direction: column; gap: 7px; }
.bar { display: grid; grid-template-columns: 1fr 130px 42px; gap: 10px; align-items: center; font-size: 12.5px; }
.bar .track { display: flex; height: 13px; border-radius: 2px; overflow: hidden; background: var(--panel-sunk); }
.bar .seg-full { background: var(--full); }
.bar .seg-partial { background: var(--partial); }
.bar .seg-absent { background: var(--absent); }
.bar .num { font-family: var(--mono); font-size: 12px; text-align: right; font-variant-numeric: tabular-nums; color: var(--ink-muted); }

.conv { display: flex; flex-direction: column; gap: 5px; }
.conv-row { display: grid; grid-template-columns: 26px 1fr; gap: 10px; align-items: center; }
.conv-row .n { font-family: var(--mono); font-size: 12px; color: var(--ink-faint); text-align: right; font-variant-numeric: tabular-nums; }
.conv-row .dots { display: flex; flex-wrap: wrap; gap: 3px; }
.dot { width: 11px; height: 11px; border-radius: 2px; background: var(--accent); opacity: 0.85; }

table.plain { border-collapse: collapse; font-size: 13px; width: 100%; }
table.plain th { text-align: left; font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.09em; text-transform: uppercase; color: var(--ink-faint); font-weight: 500; padding: 0 10px 7px 0; border-bottom: 1px solid var(--rule); }
table.plain td { padding: 6px 10px 6px 0; border-bottom: 1px solid var(--rule); vertical-align: top; }
table.plain td.num { font-family: var(--mono); text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.tablebox { overflow-x: auto; }

footer { border-top: 1px solid var(--rule); padding-top: 20px; color: var(--ink-faint); font-size: 12.5px; display: flex; flex-direction: column; gap: 6px; }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
@media (max-width: 720px) {
  .wrap { padding: 28px 14px 64px; }
  table.grid thead th.corner, table.grid tbody th.rowhead { min-width: 220px; max-width: 220px; }
}
`;

const SYMBOL: Record<Coverage, string> = { full: '✓', partial: '~', absent: '·', unknown: '?' };

export function renderVisual(survey: Survey): string {
  const projects = analyzed(survey);
  const stats = summarize(survey);
  const byProject = extrasByProject(survey);
  const totals = areaTotals(survey);

  type Row = {
    id: string;
    label: string;
    description: string;
    band: string;
    cicero: Coverage;
    cells: Cell[];
    detail: string;
  };
  const rows: Row[] = [];

  for (const area of survey.features.areas) {
    rows.push({
      id: area.id,
      label: area.label,
      description: area.description,
      band: 'baseline',
      cicero: 'full',
      cells: projects.map((p) => ({
        value: p.coverage![area.id],
        title: `${p.project} — ${area.label}: ${p.coverage![area.id]}`,
      })),
      detail: 'Baseline area from the brief. Verified in each project’s source at the pinned commit.',
    });
  }

  for (const extra of survey.features.extras) {
    const shipped = new Set(extra.projects);
    rows.push({
      id: extra.id,
      label: extra.title,
      description: extra.description,
      band: 'extra',
      cicero: 'absent',
      cells: projects.map((p) => ({
        value: shipped.has(p.slug) ? 'full' : 'unknown',
        title: shipped.has(p.slug)
          ? `${p.project} shipped this`
          : `${p.project} — not attributed (not the same as verified absent)`,
      })),
      detail: `Shipped by ${extra.convergence} of ${projects.length} analyzed projects. Cicero does not have it.`,
    });
  }

  for (const cd of survey.features.ciceroDifferentiators) {
    const area = cd.derivedFromArea;
    rows.push({
      id: cd.id,
      label: cd.title,
      description: `Counted absent in ${cd.absentIn} of ${cd.of} analyzed projects.`,
      band: 'cicero',
      cicero: 'full',
      cells: projects.map((p) => ({
        value: area ? p.coverage![area] : 'unknown',
        title: area
          ? `${p.project} — ${area}: ${p.coverage![area]}`
          : `${p.project} — not measured per project; only the field-wide count is known`,
      })),
      detail: area
        ? 'Cicero capability. Per-project values come from the matching baseline area.'
        : 'Cicero capability. Only the field-wide absent count was recorded, so per-project cells are unknown.',
    });
  }

  const bands: { key: string; title: string; note: string }[] = [
    {
      key: 'baseline',
      title: `Baseline — the brief everyone was measured on (${survey.features.areas.length})`,
      note: 'Verified per project against source.',
    },
    {
      key: 'extra',
      title: `Beyond the brief — shipped by others, absent in Cicero (${survey.features.extras.length})`,
      note: 'A blank cell means unattributed, not verified absent.',
    },
    {
      key: 'cicero',
      title: `Cicero capabilities counted across the field (${survey.features.ciceroDifferentiators.length})`,
      note: 'Field-wide counts; three map onto a baseline area.',
    },
  ];

  const colCount = projects.length + 2;
  const headerCells = projects
    .map((p) => `<th scope="col" title="${escapeHtml(p.project)}"><div class="vhead">${escapeHtml(p.project)}</div></th>`)
    .join('');

  const bodyHtml = bands
    .map((band) => {
      const bandRows = rows.filter((r) => r.band === band.key);
      const header = `<tr class="band"><th scope="colgroup" colspan="${colCount}">${escapeHtml(band.title)} <span style="text-transform:none;letter-spacing:0;font-weight:400;color:var(--ink-faint)">— ${escapeHtml(band.note)}</span></th></tr>`;
      const body = bandRows
        .map((row) => {
          const cells = row.cells
            .map((c) => `<td class="cell ${c.value}" title="${escapeHtml(c.title)}">${SYMBOL[c.value]}</td>`)
            .join('');
          return (
            `<tr data-row="${escapeHtml(row.id)}" data-search="${escapeHtml((row.label + ' ' + row.description).toLowerCase())}">` +
            `<th class="rowhead" scope="row" tabindex="0"><span class="fid">${escapeHtml(row.id)}</span>${escapeHtml(row.label)}</th>` +
            `<td class="cell cicero-col ${row.cicero}" title="Cicero — ${row.cicero}">${SYMBOL[row.cicero]}</td>` +
            cells +
            '</tr>'
          );
        })
        .join('');
      return header + body;
    })
    .join('');

  const rowData = Object.fromEntries(
    rows.map((row) => [
      row.id,
      {
        label: row.label,
        description: row.description,
        detail: row.detail,
        projects:
          row.band === 'extra'
            ? survey.features.extras.find((e) => e.id === row.id)!.projects.map((s) => projects.find((p) => p.slug === s)!.project)
            : [],
      },
    ]),
  );

  const totalBars = totals
    .map((t) => {
      const pct = (n: number) => `${(n / projects.length) * 100}%`;
      return (
        `<div class="bar"><span>${escapeHtml(t.area.label)}</span>` +
        `<span class="track">` +
        `<span class="seg-full" style="width:${pct(t.full)}"></span>` +
        `<span class="seg-partial" style="width:${pct(t.partial)}"></span>` +
        `<span class="seg-absent" style="width:${pct(t.absent)}"></span>` +
        `</span><span class="num">${t.full}/${projects.length}</span></div>`
      );
    })
    .join('');

  const maxConv = Math.max(...survey.features.extras.map((e) => e.convergence));
  const convRows = Array.from({ length: maxConv }, (_, i) => maxConv - i)
    .map((n) => {
      const items = survey.features.extras.filter((e) => e.convergence === n);
      if (items.length === 0) return '';
      const dots = items.map((e) => `<span class="dot" title="${escapeHtml(e.title)}"></span>`).join('');
      return `<div class="conv-row"><span class="n">${n}×</span><span class="dots">${dots}</span></div>`;
    })
    .join('');

  const stackTable = (label: string, counts: Record<string, number>) =>
    `<div class="card"><h3>${escapeHtml(label)}</h3><div class="tablebox"><table class="plain">` +
    Object.entries(counts)
      .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td class="num">${v}</td></tr>`)
      .join('') +
    '</table></div></div>';

  const projectTable = projects
    .map((p) => {
      const extras = byProject.get(p.slug) ?? [];
      const full = Object.values(p.coverage!).filter((v) => v === 'full').length;
      return (
        `<tr><td><a href="${escapeHtml(p.source ?? '#')}">${escapeHtml(p.project)}</a></td>` +
        `<td>${escapeHtml(p.stack!.language)} · ${escapeHtml(p.stack!.framework)}</td>` +
        `<td>${escapeHtml(p.stack!.datastore)}</td>` +
        `<td class="num">${full}/${survey.features.areas.length}</td>` +
        `<td class="num">${extras.length}</td>` +
        `<td class="num">${p.scale!.lines.toLocaleString('en-US')}</td>` +
        `<td class="num">${p.scale!.commitsAreLowerBound ? '≥' : ''}${p.scale!.commits}</td>` +
        `<td class="num">${p.scale!.authors}</td></tr>`
      );
    })
    .join('');

  const notAnalyzed = survey.projects.filter((p) => p.status !== 'analyzed');
  const notAnalyzedRows = notAnalyzed
    .map(
      (p) =>
        `<tr><td>${escapeHtml(p.project)}</td><td>${escapeHtml(p.status)}</td><td class="muted small">${escapeHtml(p.reason ?? '')}</td></tr>`,
    )
    .join('');

  return `<title>Sessionboard clones — the full feature grid</title>
<style>${CSS}</style>
<div class="wrap">
  <header class="masthead">
    <p class="eyebrow">${escapeHtml(survey.brief)} · surveyed ${escapeHtml(survey.surveyedOn)}</p>
    <h1>One brief, ${stats.counts.analyzed} codebases, ${stats.counts.totalFeatureRows} features</h1>
    <p class="lede">Every feature found across every entrant's Sessionboard clone that published source, read from
      code at a pinned commit rather than from a README. Cicero is the first column. Nothing is ranked — teams
      solving one specification is a natural experiment, and the output is the spread of choices, not a scoreboard.</p>
    <div class="stats">
      <div class="stat"><b>${stats.counts.submissionsFound}</b><span>submissions found</span></div>
      <div class="stat"><b>${stats.counts.analyzed}</b><span>source analyzed</span></div>
      <div class="stat"><b>${stats.counts.noPublicSource + stats.counts.sourceUnreachable}</b><span>no source read</span></div>
      <div class="stat"><b>${stats.counts.baselineAreas}</b><span>baseline areas</span></div>
      <div class="stat"><b>${stats.counts.extras}</b><span>beyond the brief</span></div>
      <div class="stat"><b>${stats.counts.attributions}</b><span>attributions</span></div>
    </div>
  </header>

  <section>
    <div class="section-head">
      <h2>The grid</h2>
      <p class="muted small">Click any row for its description and attributions. ${stats.counts.totalFeatureRows} features ×
        ${projects.length} projects — scroll the grid in both directions.</p>
    </div>
    <div class="controls">
      <input id="filter" type="search" placeholder="Filter features…" aria-label="Filter features" />
      <button type="button" id="only-extras" aria-pressed="false">Only beyond-the-brief</button>
      <button type="button" id="reset">Reset</button>
    </div>
    <div class="legend">
      <span><i class="key full">✓</i> shipped, verified in source</span>
      <span><i class="key partial">~</i> partial — schema without queries, UI without a server action</span>
      <span><i class="key absent">·</i> absent, or not attributed to this project</span>
      <span><i class="key unknown">?</i> not determined</span>
    </div>
    <div class="gridbox">
      <table class="grid">
        <thead>
          <tr>
            <th class="corner" scope="col"><span class="corner-label">Feature</span></th>
            <th scope="col" class="col-cicero" title="Cicero"><div class="vhead">Cicero (ours)</div></th>
            ${headerCells}
          </tr>
        </thead>
        <tbody id="gridbody">${bodyHtml}</tbody>
      </table>
    </div>
    <div class="detail" id="detail" aria-live="polite">
      <p class="eyebrow">Selected feature</p>
      <p class="muted">Select a row in the grid to read its description and which projects shipped it.</p>
    </div>
  </section>

  <section>
    <div class="section-head">
      <h2>Where the field converged</h2>
      <p class="muted small">Left: how many of the ${projects.length} cleared each baseline area. Right: each
        beyond-the-brief feature as one square, grouped by how many independent teams arrived at it.</p>
    </div>
    <div class="panels">
      <div class="card">
        <h3>Baseline coverage</h3>
        <div class="bars">${totalBars}</div>
      </div>
      <div class="card">
        <h3>Convergence on features beyond the brief</h3>
        <div class="conv">${convRows}</div>
        <p class="muted small">Independent arrival is the signal. ${survey.features.extras.filter((e) => e.convergence === 1).length}
          of ${survey.features.extras.length} were built by exactly one team.</p>
      </div>
    </div>
  </section>

  <section>
    <div class="section-head"><h2>How they built it</h2></div>
    <div class="panels">
      ${stackTable('Language', stats.stack.language)}
      ${stackTable('Framework', stats.stack.framework)}
      ${stackTable('Datastore', stats.stack.datastore)}
      ${stackTable('Data access', stats.stack.dataAccess)}
    </div>
  </section>

  <section>
    <div class="section-head">
      <h2>The projects</h2>
      <p class="muted small">Commit counts marked ≥ come from shallow clones. Lines span
        ${stats.scale.lines.min.toLocaleString('en-US')}–${stats.scale.lines.max.toLocaleString('en-US')},
        median ${stats.scale.lines.median.toLocaleString('en-US')}; every history begins on or after
        ${escapeHtml(stats.scale.firstCommit)}.</p>
    </div>
    <div class="tablebox">
      <table class="plain">
        <thead><tr><th>Project</th><th>Stack</th><th>Datastore</th><th>Baseline</th><th>Beyond</th><th>Lines</th><th>Commits</th><th>Authors</th></tr></thead>
        <tbody>${projectTable}</tbody>
      </table>
    </div>
  </section>

  <section>
    <div class="section-head">
      <h2>Found but not analyzed (${notAnalyzed.length})</h2>
      <p class="muted small">An honest denominator matters more than a big numerator. Deployed sites were not
        fetched or probed — this survey reads code, and for these there was none to read.</p>
    </div>
    <div class="tablebox">
      <table class="plain">
        <thead><tr><th>Submission</th><th>Status</th><th>Why</th></tr></thead>
        <tbody>${notAnalyzedRows}</tbody>
      </table>
    </div>
  </section>

  <footer>
    <p>Generated by <code>bun run alternatives:build</code> from <code>docs/alternatives/data/</code>. Regenerate it
      after adding a repository; do not hand-edit.</p>
    <p>Presence, not quality. A ✓ means the capability was found in source, not that it is good, complete, or
      production-ready — and these are hackathon-window projects, not commercial products.</p>
  </footer>
</div>
<script>
(function () {
  var rowData = ${JSON.stringify(rowData)};
  var body = document.getElementById('gridbody');
  var detail = document.getElementById('detail');
  var filter = document.getElementById('filter');
  var onlyExtras = document.getElementById('only-extras');

  function select(tr) {
    var id = tr.getAttribute('data-row');
    var data = rowData[id];
    if (!data) return;
    Array.prototype.forEach.call(body.querySelectorAll('tr[aria-selected="true"]'), function (r) {
      r.removeAttribute('aria-selected');
    });
    tr.setAttribute('aria-selected', 'true');
    var chips = data.projects.length
      ? '<div class="chips">' + data.projects.map(function (p) {
          return '<span class="chip">' + p + '</span>';
        }).join('') + '</div>'
      : '';
    detail.innerHTML = '<p class="eyebrow">' + id + '</p><h3>' + data.label + '</h3>' +
      '<p>' + data.description + '</p><p class="muted small">' + data.detail + '</p>' + chips;
  }

  body.addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-row]');
    if (tr) select(tr);
  });
  body.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var tr = e.target.closest('tr[data-row]');
    if (tr) { e.preventDefault(); select(tr); }
  });

  function apply() {
    var q = filter.value.trim().toLowerCase();
    var extrasOnly = onlyExtras.getAttribute('aria-pressed') === 'true';
    Array.prototype.forEach.call(body.querySelectorAll('tr[data-row]'), function (tr) {
      var hay = tr.getAttribute('data-search') + ' ' + tr.getAttribute('data-row').toLowerCase();
      var isExtra = tr.getAttribute('data-row').indexOf('AD-') === 0;
      var show = (!q || hay.indexOf(q) !== -1) && (!extrasOnly || isExtra);
      tr.classList.toggle('hidden', !show);
    });
  }
  filter.addEventListener('input', apply);
  onlyExtras.addEventListener('click', function () {
    onlyExtras.setAttribute('aria-pressed', onlyExtras.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
    apply();
  });
  document.getElementById('reset').addEventListener('click', function () {
    filter.value = '';
    onlyExtras.setAttribute('aria-pressed', 'false');
    apply();
  });
})();
</script>
`;
}
