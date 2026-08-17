import { describe, expect, it } from 'vitest';
import {
  FIELD_SURVEY_SITE_URL,
  renderStandalonePage,
  renderSubmissionMarkdown,
  SUBMISSION_DOCUMENTS,
} from './generate-submission-html';

describe('standalone submission HTML', () => {
  it('keeps submission documents within the standalone artifact set', () => {
    const html = renderSubmissionMarkdown(
      '[summary](06-submission-summary.md) [evidence](06-submission-evidence.md#hosted-demo)',
    );

    expect(html).toContain('href="summary.html"');
    expect(html).toContain('href="evidence.html#hosted-demo"');
  });

  it('rewrites source-relative documentation and image paths from the output directory', () => {
    const html = renderSubmissionMarkdown(
      '[requirements](01-requirements.md) [root readme](../README.md) ![Agenda](images/submission-evidence/local-seeded-agenda.png)',
    );

    expect(html).toContain('href="../01-requirements.md"');
    expect(html).toContain('href="../../README.md"');
    expect(html).toContain('src="../images/submission-evidence/local-seeded-agenda.png"');
  });

  it('drops raw HTML and unsafe protocols', () => {
    const html = renderSubmissionMarkdown(
      '<script>alert(1)</script>\n\n[unsafe](javascript:alert(1))',
    );

    expect(html).not.toContain('<script');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('unsafe');
  });

  it('produces a complete offline-readable page with source and active-document links', () => {
    const document = SUBMISSION_DOCUMENTS[1];
    const html = renderStandalonePage(document, '# Short form');

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('href="../06-submission-summary.md"');
    expect(html).toContain('href="summary.html" aria-current="page"');
    expect(html).toContain(`href="${FIELD_SURVEY_SITE_URL}"`);
    expect(html).toContain('<h1 id="short-form">Short form</h1>');
  });
});
