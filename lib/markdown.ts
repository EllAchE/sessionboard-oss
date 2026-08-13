import { Marked, type RendererObject, type RendererThis, type Tokens } from 'marked';

/**
 * Two renderers, and the choice between them is a security boundary rather than a preference.
 *
 * Speaker-authored text — bios, abstracts, task notes — is UNTRUSTED. It renders through a marked
 * instance whose `html` renderer drops raw HTML tokens outright, so the output tag set is exactly
 * what marked itself emits. That is the whole reason this codebase writes markdown instead of
 * shipping a rich-text editor: there is no sanitiser to get subtly wrong, because no attacker-
 * supplied tag ever reaches the output. Only URLs need filtering, since marked will happily put a
 * `javascript:` href inside an anchor it generated.
 *
 * Organizer-authored portal pages are TRUSTED and allow raw HTML, which is what satisfies the
 * brief's HTML-embed requirement. An organizer who injects a script into their own event's portal
 * has done the equivalent of editing their own website. Never route participant input here.
 */

const SAFE_PROTOCOL = /^(https?:|mailto:|tel:|#|\/)/i;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * `javascript:`, `data:` and `vbscript:` all execute when clicked. Entity encoding and embedded
 * control characters are how the obvious blocklist gets walked past — `java&#115;cript:` and
 * `java\tscript:` both survive a naive `startsWith`. Normalise both away, then test what is left
 * against an allowlist rather than trying to enumerate what is dangerous.
 */
function safeUrl(href: string | null | undefined): string | null {
  if (!href) return null;
  const normalized = Array.from(href)
    .filter((char) => char.charCodeAt(0) > 0x20)
    .join('')
    .replace(/&#(x)?([0-9a-f]+);?/gi, (_match, hex: string | undefined, code: string) =>
      String.fromCharCode(parseInt(code, hex ? 16 : 10)),
    )
    .trim();
  return SAFE_PROTOCOL.test(normalized) ? normalized : null;
}

/**
 * Installed with `.use()`, not passed to the constructor. A `renderer` in the constructor options
 * is silently ignored by marked v15 — the parse succeeds and every override is skipped, so raw
 * HTML and `javascript:` hrefs sail through with no error anywhere. `lib/markdown.test.ts` exists
 * because that failure is invisible by inspection.
 */
const untrustedRenderer: RendererObject = {
  /** Raw HTML in participant input is dropped, not escaped — a visible `<script>` is still noise. */
  html(): string {
    return '';
  },

  link(this: RendererThis, { href, title, tokens }: Tokens.Link): string {
    const url = safeUrl(href);
    const text = this.parser.parseInline(tokens);
    if (!url) return text;
    const attr = title ? ` title="${escapeHtml(title)}"` : '';
    return `<a href="${escapeHtml(url)}"${attr} rel="nofollow ugc noopener" target="_blank">${text}</a>`;
  },

  image(_token: Tokens.Image): string {
    const url = safeUrl(_token.href);
    if (!url) return escapeHtml(_token.text ?? '');
    const attr = _token.title ? ` title="${escapeHtml(_token.title)}"` : '';
    return `<img src="${escapeHtml(url)}" alt="${escapeHtml(_token.text ?? '')}"${attr} loading="lazy" />`;
  },
};

const untrusted = new Marked({ gfm: true, breaks: true }).use({ renderer: untrustedRenderer });

const trusted = new Marked({ gfm: true, breaks: true });

function isAsciiPunctuation(character: string): boolean {
  const code = character.charCodeAt(0);
  return (
    (code >= 0x21 && code <= 0x2f) ||
    (code >= 0x3a && code <= 0x40) ||
    (code >= 0x5b && code <= 0x60) ||
    (code >= 0x7b && code <= 0x7e)
  );
}

export function escapeMarkdownText(value: string): string {
  return Array.from(value, (character) =>
    isAsciiPunctuation(character) ? `\\${character}` : character,
  ).join('');
}

/** Speaker-authored text. Safe to interpolate into `dangerouslySetInnerHTML`. */
export function renderMarkdown(source: string | null | undefined): string {
  if (!source) return '';
  return untrusted.parse(source, { async: false });
}

/** Organizer-authored portal content. Raw HTML passes through by design. */
export function renderTrustedMarkdown(source: string | null | undefined): string {
  if (!source) return '';
  return trusted.parse(source, { async: false });
}

/**
 * Plain text for email bodies, embeds and the `<meta name="description">` — anywhere HTML would be
 * shown literally. Deliberately naive: it strips syntax, it does not reflow.
 */
export function markdownToText(source: string | null | undefined): string {
  if (!source) return '';
  const escaped: string[] = [];
  const protectedSource = source.replace(/\\(.)/g, (match, character: string) => {
    if (!isAsciiPunctuation(character)) return match;
    const index = escaped.push(character) - 1;
    return `\uE000${index}\uE001`;
  });
  return protectedSource
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Not `\s`, which would eat the newline and collapse paragraphs into one another.
    .replace(/^[#> \t-]+/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\uE000(\d+)\uE001/g, (_match, index: string) => escaped[Number(index)] ?? '')
    .trim();
}

/** `F-15` counts against the text a human wrote, not the markdown they wrote it in. */
export function markdownLength(source: string | null | undefined): number {
  return markdownToText(source).length;
}

export function excerpt(source: string | null | undefined, max = 200): string {
  const text = markdownToText(source).replace(/\s+/g, ' ');
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
