import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked, type RendererObject, type Tokens } from 'marked';

const REPOSITORY_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const DOCS_DIRECTORY = path.join(REPOSITORY_ROOT, 'docs');
const OUTPUT_DIRECTORY = path.join(DOCS_DIRECTORY, 'submission');
export const FIELD_SURVEY_SITE_URL = 'https://cicero-field-survey.elehche.workers.dev/';

export const SUBMISSION_DOCUMENTS = [
  {
    slug: 'narrative',
    sourceFile: '06-submission-narrative.md',
    outputFile: 'index.html',
    tabLabel: 'Full write-up',
    description: 'The complete product thesis, feature coverage, additions, tradeoffs, and roadmap.',
  },
  {
    slug: 'summary',
    sourceFile: '06-submission-summary.md',
    outputFile: 'summary.html',
    tabLabel: 'Short form',
    description: 'A compact version for application fields and time-constrained review.',
  },
  {
    slug: 'evidence',
    sourceFile: '06-submission-evidence.md',
    outputFile: 'evidence.html',
    tabLabel: 'Evidence',
    description: 'Dated local and hosted checks, seeded data, screenshots, and deployment caveats.',
  },
] as const;

export type SubmissionDocument = (typeof SUBMISSION_DOCUMENTS)[number];

const DOCUMENT_OUTPUTS = Object.fromEntries(
  SUBMISSION_DOCUMENTS.map((document) => [document.sourceFile, document.outputFile]),
) as Readonly<Record<string, string>>;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeAbsoluteUrl(value: string): string | undefined {
  if (value.startsWith('#') && /^#[a-zA-Z0-9_:.-]+$/.test(value)) return value;

  try {
    const parsed = new URL(value);
    return ['https:', 'http:', 'mailto:'].includes(parsed.protocol) ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function splitFragment(href: string): { pathPart: string; fragment: string } {
  const separator = href.indexOf('#');
  if (separator === -1) return { pathPart: href, fragment: '' };
  return { pathPart: href.slice(0, separator), fragment: href.slice(separator) };
}

function rewriteLocalReference(href: string): string | undefined {
  const direct = safeAbsoluteUrl(href);
  if (direct) return direct;

  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(href)) return undefined;

  const { pathPart, fragment } = splitFragment(href);
  const documentOutput = DOCUMENT_OUTPUTS[pathPart];
  if (documentOutput) return `${documentOutput}${fragment}`;
  if (!pathPart || pathPart.startsWith('/') || pathPart.includes('\\')) return undefined;

  const targetFromDocs = path.posix.normalize(pathPart);
  const targetFromOutput = path.posix.relative('submission', targetFromDocs);
  return `${targetFromOutput || '.'}${fragment}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-') || 'section';
}

/**
 * The source is repository-owned, but raw HTML and unsafe protocols are still rejected so a prose
 * edit cannot silently turn the checked-in reading copy into executable browser content.
 */
export function renderSubmissionMarkdown(source: string): string {
  const usedSlugs = new Map<string, number>();

  const renderer: RendererObject = {
    html() {
      return '';
    },
    heading({ tokens, depth }: Tokens.Heading) {
      const body = this.parser.parseInline(tokens);
      const baseSlug = slugify(body);
      const seen = usedSlugs.get(baseSlug) ?? 0;
      usedSlugs.set(baseSlug, seen + 1);
      const slug = seen === 0 ? baseSlug : `${baseSlug}-${seen + 1}`;
      return `<h${depth} id="${escapeHtml(slug)}">${body}</h${depth}>\n`;
    },
    link({ href, title, tokens }: Tokens.Link) {
      const body = this.parser.parseInline(tokens);
      const safeHref = rewriteLocalReference(href);
      if (!safeHref) return body;
      const titleAttribute = title ? ` title="${escapeHtml(title)}"` : '';
      const externalAttributes = safeHref.startsWith('http')
        ? ' target="_blank" rel="noreferrer"'
        : '';
      return `<a href="${escapeHtml(safeHref)}"${titleAttribute}${externalAttributes}>${body}</a>`;
    },
    image({ href, title, text }: Tokens.Image) {
      const safeHref = rewriteLocalReference(href);
      if (!safeHref) return escapeHtml(text);
      const titleAttribute = title ? ` title="${escapeHtml(title)}"` : '';
      return `<img src="${escapeHtml(safeHref)}" alt="${escapeHtml(text)}"${titleAttribute} loading="lazy">`;
    },
  };

  const parser = new Marked({ gfm: true, breaks: false }).use({ renderer });
  return parser.parse(source) as string;
}

function ciceroMark(): string {
  return `<svg class="brand-mark" width="26" height="26" viewBox="0 0 64 64" aria-hidden="true"><rect x="3" y="3" width="58" height="58" rx="7" fill="#b0a794"/><rect x="5" y="5" width="54" height="54" rx="5" fill="#fff"/><path fill="#b7391f" d="M15.5 15.5h33v3h-33zM15.5 45.5h33v3h-33zM15.5 15.5h3v33h-3zM25.5 15.5h3v33h-3zM35.5 15.5h3v33h-3zM45.5 15.5h3v33h-3z"/></svg>`;
}

export function renderStandalonePage(document: SubmissionDocument, markdown: string): string {
  const article = renderSubmissionMarkdown(markdown);
  const tabs = SUBMISSION_DOCUMENTS.map((item) => {
    const active = item.slug === document.slug;
    return `<a class="document-link${active ? ' document-link-active' : ''}" href="${item.outputFile}"${active ? ' aria-current="page"' : ''}>${escapeHtml(item.tabLabel)}</a>`;
  }).join('\n        ');

  return `<!doctype html>
<!-- Generated by bun run docs:submission. Edit ${document.sourceFile}, not this file. -->
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(document.description)}">
  <title>${escapeHtml(document.tabLabel)} — Cicero submission</title>
  <link rel="stylesheet" href="submission.css">
</head>
<body>
  <header class="topbar">
    <div class="topbar-inner">
      <a class="brand" href="index.html" aria-label="Cicero submission home">${ciceroMark()}<span>Cicero</span></a>
      <nav class="topbar-links" aria-label="Related resources">
        <a class="back-link" href="${FIELD_SURVEY_SITE_URL}" target="_blank" rel="noreferrer">Field survey ↗</a>
        <a class="back-link" href="https://github.com/EllAchE/sessionboard-oss#readme" target="_blank" rel="noreferrer">Repository ↗</a>
      </nav>
    </div>
  </header>
  <main class="page">
    <section class="hero" aria-labelledby="submission-label">
      <div class="hero-copy">
        <p class="eyebrow" id="submission-label">Competition submission · August 2026</p>
        <p class="intro">One canonical write-up, rendered for reading. These standalone files are generated directly from the checked-in Markdown.</p>
      </div>
      <a class="source-link" href="../${document.sourceFile}">View Markdown source ↗</a>
    </section>
    <nav class="document-nav" aria-label="Submission documents">
        ${tabs}
    </nav>
    <div class="document-shell">
      <div class="mirror-note"><span class="status-dot" aria-hidden="true"></span>Generated from <code>docs/${document.sourceFile}</code></div>
      <article class="article">
${article}
      </article>
    </div>
  </main>
  <footer class="footer"><span>Cicero · Open-source conference operations</span><span>MIT licensed · 2026</span></footer>
</body>
</html>
`;
}

export async function generateSubmissionHtml(): Promise<void> {
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  await Promise.all(
    SUBMISSION_DOCUMENTS.map(async (document) => {
      const markdown = await readFile(path.join(DOCS_DIRECTORY, document.sourceFile), 'utf8');
      await writeFile(
        path.join(OUTPUT_DIRECTORY, document.outputFile),
        renderStandalonePage(document, markdown),
        'utf8',
      );
    }),
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await generateSubmissionHtml();
  process.stdout.write(`Generated ${SUBMISSION_DOCUMENTS.length} standalone submission pages.\n`);
}
