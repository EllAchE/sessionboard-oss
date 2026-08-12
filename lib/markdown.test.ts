import { describe, expect, it } from 'vitest';
import { excerpt, markdownLength, markdownToText, renderMarkdown, renderTrustedMarkdown } from './markdown';

describe('renderMarkdown (untrusted)', () => {
  it('renders ordinary markdown', () => {
    const html = renderMarkdown('# Hello\n\nSome **bold** text.');
    expect(html).toContain('<h1>Hello</h1>');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('drops the tag, leaving script bodies as inert text', () => {
    const html = renderMarkdown('before <script>alert(1)</script> after');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('</script');
    // The body survives as text content, which renders visibly and executes nowhere.
    expect(html).toBe('<p>before alert(1) after</p>\n');
  });

  it('drops block-level HTML', () => {
    const html = renderMarkdown('<div onclick="steal()">hi</div>\n\nparagraph');
    expect(html).not.toContain('<div');
    expect(html).not.toContain('onclick');
    expect(html).toContain('paragraph');
  });

  it('strips javascript: hrefs but keeps the link text', () => {
    const html = renderMarkdown('[click me](javascript:alert(1))');
    expect(html).not.toContain('javascript');
    expect(html).not.toContain('<a ');
    expect(html).toContain('click me');
  });

  it.each([
    ['entity-encoded', '[x](java&#115;cript:alert(1))'],
    ['tab-interrupted', '[x](java\tscript:alert(1))'],
    ['newline-interrupted', '[x](java\nscript:alert(1))'],
    ['leading-control', '[x](javascript:alert(1))'],
    ['uppercase', '[x](JaVaScRiPt:alert(1))'],
    ['data url', '[x](data:text/html;base64,PHNjcmlwdD4=)'],
    ['vbscript', '[x](vbscript:msgbox)'],
  ])('rejects a %s scheme', (_label, source) => {
    const html = renderMarkdown(source);
    expect(html).not.toMatch(/href=/);
  });

  it('keeps safe schemes', () => {
    expect(renderMarkdown('[a](https://example.com)')).toContain('href="https://example.com"');
    expect(renderMarkdown('[a](mailto:x@example.com)')).toContain('href="mailto:x@example.com"');
    expect(renderMarkdown('[a](/portal)')).toContain('href="/portal"');
  });

  it('marks external links nofollow and noopener', () => {
    const html = renderMarkdown('[a](https://example.com)');
    expect(html).toContain('rel="nofollow ugc noopener"');
  });

  it('strips javascript: from image sources', () => {
    const html = renderMarkdown('![alt](javascript:alert(1))');
    expect(html).not.toContain('<img');
    expect(html).toContain('alt');
  });

  it('escapes a title attribute rather than letting it close the tag', () => {
    const html = renderMarkdown('[a](https://example.com "x\\" onmouseover=\\"evil()")');
    expect(html).not.toContain('onmouseover="evil()"');
  });
});

describe('renderTrustedMarkdown', () => {
  it('passes raw HTML through, which is the point', () => {
    const html = renderTrustedMarkdown('<iframe src="https://example.com"></iframe>');
    expect(html).toContain('<iframe');
  });
});

describe('text helpers', () => {
  it('strips markdown syntax', () => {
    expect(markdownToText('# Title\n\n**bold** and [link](https://x.com)')).toBe('Title\n\nbold and link');
  });

  it('counts what a reader sees, not the syntax', () => {
    expect(markdownLength('**bold**')).toBe(4);
  });

  it('truncates with an ellipsis only when needed', () => {
    expect(excerpt('short', 20)).toBe('short');
    expect(excerpt('a'.repeat(30), 10)).toHaveLength(10);
  });
});
