import { describe, expect, it } from 'vitest';
import { EMBED_VIEWS } from '@/app/embed/model';
import { buildLlmsTxt, GET } from './route';

const ORIGIN = 'https://cicero.test';

describe('llms.txt', () => {
  it('uses absolute links only for resources that can actually be fetched', () => {
    const body = buildLlmsTxt(ORIGIN);
    const links = [...body.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]);

    expect(links.length).toBeGreaterThan(0);
    expect(links.every((link) => link.startsWith('https://'))).toBe(true);
    expect(links.every((link) => !/[{}]/.test(link))).toBe(true);
    expect(body).not.toContain('localhost');
  });

  it('advertises the origin it was asked about, without doubling its slash', () => {
    expect(buildLlmsTxt(`${ORIGIN}/`)).not.toContain(`${ORIGIN}//`);
    expect(buildLlmsTxt(`${ORIGIN}/`)).toContain(`${ORIGIN}/api/v1/openapi.json`);
  });

  it('points to the authoritative developer and crawler contracts', () => {
    const body = buildLlmsTxt(ORIGIN);

    for (const resource of [
      '/api/v1/openapi.json',
      '/api/v1/mcp-tools.json',
      '/robots.txt',
      '/embed.js',
    ]) {
      expect(body).toContain(`${ORIGIN}${resource}`);
    }
    expect(body).toContain('https://github.com/EllAchE/sessionboard-oss');
  });

  it('opens with the heading and one-line summary the format is read for', () => {
    const [heading, blank, summary] = buildLlmsTxt(ORIGIN).split('\n');

    expect(heading).toBe('# Cicero');
    expect(blank).toBe('');
    expect(summary.startsWith('> ')).toBe(true);
  });

  it('documents every embeddable view', () => {
    const body = buildLlmsTxt(ORIGIN);

    for (const view of EMBED_VIEWS) {
      expect(body).toContain(`\`${view}\``);
    }
  });

  it('uses ordinary conference vocabulary without a translation glossary', () => {
    const body = buildLlmsTxt(ORIGIN);

    expect(body).toContain('conference home');
    expect(body).toContain('searchable sessions');
    expect(body).toContain('published call for speakers');
    expect(body).not.toContain('## Glossary');
    expect(body).not.toMatch(/\b(?:petition|orator|oration|fasti|aqueduct key)\b/i);
  });

  it('keeps parameterized routes as templates instead of duplicating API documentation', () => {
    const body = buildLlmsTxt(ORIGIN);

    for (const route of [
      '/{slug}',
      '/{slug}/agenda',
      '/{slug}/itinerary',
      '/{slug}/sessions',
      '/{slug}/speakers',
      '/{slug}/speakers/{speakerSlug}',
      '/{slug}/gallery',
      '/{slug}/sponsors',
      '/submit/{eventSlug}/{formSlug}',
      '/embed/{slug}/{view}',
      '/api/v1/events/{slug}/mcp',
    ]) {
      expect(body).toContain(`\`${route}\``);
    }

    expect(body).not.toMatch(/\`(?:GET|POST|PUT|PATCH|DELETE)\s/);
    expect(body).not.toContain('## Glossary');
    expect(body).not.toContain('## Not part of the public surface');
  });

  it('keeps organizer API keys distinct from speaker sessions', () => {
    const body = buildLlmsTxt(ORIGIN);

    expect(body).toMatch(/Organizer operations use an\s+event-scoped API key\./);
    expect(body).toContain('Speaker proposal, profile, and task operations use that speaker’s');
  });

  it('serves cacheable plain text', async () => {
    const response = await GET();

    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=3600, stale-while-revalidate=86400',
    );
    expect(await response.text()).toContain('# Cicero');
  });
});
