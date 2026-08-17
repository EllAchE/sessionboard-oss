import { describe, expect, it, vi } from 'vitest';

import { handleReadableSiteRequest, type ReadableSiteEnv } from './readable-site';

function env(siteKind: ReadableSiteEnv['SITE_KIND']) {
  const fetch = vi.fn(async (request: Request) => new Response(new URL(request.url).pathname));
  return { env: { ASSETS: { fetch }, SITE_KIND: siteKind }, fetch };
}

describe('readable-site Worker', () => {
  it('redirects the submission origin to the nested generated document', async () => {
    const bindings = env('submission');
    const response = await handleReadableSiteRequest(
      new Request('https://cicero-submission.elehche.workers.dev/'),
      bindings.env,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://cicero-submission.elehche.workers.dev/submission/index.html',
    );
    expect(bindings.fetch).not.toHaveBeenCalled();
  });

  it('serves the survey index at its root without changing the public URL', async () => {
    const bindings = env('field-survey');
    const response = await handleReadableSiteRequest(
      new Request('https://cicero-field-survey.elehche.workers.dev/'),
      bindings.env,
    );

    expect(await response.text()).toBe('/index.html');
    expect(bindings.fetch).toHaveBeenCalledOnce();
  });

  it('redirects submission source references to the public GitHub repository', async () => {
    const bindings = env('submission');
    const response = await handleReadableSiteRequest(
      new Request('https://cicero-submission.elehche.workers.dev/06-submission-evidence.md'),
      bindings.env,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://github.com/EllAchE/sessionboard-oss/blob/main/docs/06-submission-evidence.md',
    );
    expect(bindings.fetch).not.toHaveBeenCalled();
  });

  it('applies a strict external-asset policy to the submission site', async () => {
    const bindings = env('submission');
    const response = await handleReadableSiteRequest(
      new Request('https://cicero-submission.elehche.workers.dev/submission/summary.html'),
      bindings.env,
    );

    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(response.headers.get('content-security-policy')).toContain("style-src 'self'");
    expect(response.headers.get('x-frame-options')).toBe('DENY');
  });

  it('allows only the survey page inline code required by its self-contained artifact', async () => {
    const bindings = env('field-survey');
    const response = await handleReadableSiteRequest(
      new Request('https://cicero-field-survey.elehche.workers.dev/index.html'),
      bindings.env,
    );

    expect(response.headers.get('content-security-policy')).toContain("script-src 'unsafe-inline'");
    expect(response.headers.get('content-security-policy')).not.toContain('https:');
  });
});
