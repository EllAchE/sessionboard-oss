import { Marked, type RendererObject, type Tokens } from 'marked';

const GITHUB_DOCS_BASE =
  'https://github.com/EllAchE/sessionboard-oss/blob/main/docs/';

const DOCUMENT_ROUTES: Readonly<Record<string, string>> = {
  '06-submission-narrative.md': '/submission',
  '06-submission-summary.md': '/submission/summary',
  '06-submission-evidence.md': '/submission/evidence',
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeUrl(value: string): string | undefined {
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  if (value.startsWith('#') && /^#[a-zA-Z0-9_:.-]+$/.test(value)) return value;

  try {
    const parsed = new URL(value);
    return ['https:', 'http:', 'mailto:'].includes(parsed.protocol) ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function rewriteDocumentLink(href: string): string | undefined {
  const [path, fragment] = href.split('#', 2);
  const route = DOCUMENT_ROUTES[path];
  if (route) return fragment ? `${route}#${fragment}` : route;

  const direct = safeUrl(href);
  if (direct) return direct;

  try {
    return safeUrl(new URL(href, GITHUB_DOCS_BASE).toString());
  } catch {
    return undefined;
  }
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
 * Render repository-owned Markdown without accepting raw HTML or unsafe URL protocols. Relative
 * links to the three submission documents stay inside the readable view; other relative docs lead
 * to their canonical GitHub source. Image paths are supplied by the page so Next can bundle them.
 */
export function renderSubmissionMarkdown(
  source: string,
  imageUrls: Readonly<Record<string, string>> = {},
): string {
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
      const safeHref = rewriteDocumentLink(href);
      if (!safeHref) return body;
      const titleAttribute = title ? ` title="${escapeHtml(title)}"` : '';
      const externalAttributes = safeHref.startsWith('http')
        ? ' target="_blank" rel="noreferrer"'
        : '';
      return `<a href="${escapeHtml(safeHref)}"${titleAttribute}${externalAttributes}>${body}</a>`;
    },
    image({ href, title, text }: Tokens.Image) {
      const safeHref = imageUrls[href] ?? safeUrl(href);
      if (!safeHref) return escapeHtml(text);
      const titleAttribute = title ? ` title="${escapeHtml(title)}"` : '';
      return `<img src="${escapeHtml(safeHref)}" alt="${escapeHtml(text)}"${titleAttribute} loading="lazy">`;
    },
  };

  const parser = new Marked({ gfm: true, breaks: false }).use({ renderer });
  return parser.parse(source) as string;
}
