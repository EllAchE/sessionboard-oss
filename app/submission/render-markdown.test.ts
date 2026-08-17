import { describe, expect, it } from 'vitest';
import { renderSubmissionMarkdown } from './render-markdown';

describe('renderSubmissionMarkdown', () => {
  it('keeps submission documents inside the readable HTML view', () => {
    const html = renderSubmissionMarkdown(
      '[summary](06-submission-summary.md) [evidence](06-submission-evidence.md#hosted-demo)',
    );

    expect(html).toContain('href="/submission/summary"');
    expect(html).toContain('href="/submission/evidence#hosted-demo"');
  });

  it('links other relative documentation to its canonical GitHub source', () => {
    const html = renderSubmissionMarkdown(
      '[requirements](01-requirements.md) [root readme](../README.md)',
    );

    expect(html).toContain(
      'href="https://github.com/EllAchE/sessionboard-oss/blob/main/docs/01-requirements.md"',
    );
    expect(html).toContain(
      'href="https://github.com/EllAchE/sessionboard-oss/blob/main/README.md"',
    );
  });

  it('drops raw HTML and unsafe protocols', () => {
    const html = renderSubmissionMarkdown(
      '<script>alert(1)</script>\n\n[unsafe](javascript:alert(1))',
    );

    expect(html).not.toContain('<script');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('unsafe');
  });

  it('uses bundled image URLs and generates stable unique heading anchors', () => {
    const html = renderSubmissionMarkdown(
      '# Proof\n\n# Proof\n\n![Seeded agenda](images/submission-evidence/agenda.png)',
      { 'images/submission-evidence/agenda.png': '/_next/static/media/agenda.png' },
    );

    expect(html).toContain('<h1 id="proof">');
    expect(html).toContain('<h1 id="proof-2">');
    expect(html).toContain('src="/_next/static/media/agenda.png"');
    expect(html).toContain('alt="Seeded agenda"');
  });
});
