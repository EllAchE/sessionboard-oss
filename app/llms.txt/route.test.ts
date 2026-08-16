import { describe, expect, it } from 'vitest';
import { EMBED_VIEWS } from '@/app/embed/model';
import { buildLlmsTxt, GET } from './route';

const ORIGIN = 'https://cicero.test';

describe('llms.txt', () => {
  it('links absolutely, because an agent reads this with no page to resolve a path against', () => {
    const body = buildLlmsTxt(ORIGIN);

    expect(body).not.toMatch(/\]\((?!https?:\/\/)/);
    expect(body).toContain(`${ORIGIN}/{slug}/agenda`);
    expect(body).not.toContain('localhost');
  });

  it('advertises the origin it was asked about, without doubling its slash', () => {
    expect(buildLlmsTxt(`${ORIGIN}/`)).not.toContain(`${ORIGIN}//`);
    expect(buildLlmsTxt(`${ORIGIN}/`)).toContain(`${ORIGIN}/api/v1/openapi.json`);
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

    expect(body).toContain('Submission form');
    expect(body).toContain('Speakers');
    expect(body).toContain('published schedule');
    expect(body).not.toContain('## Glossary');
    expect(body).not.toMatch(/\b(?:petition|orator|oration|fasti|aqueduct key)\b/i);
  });

  it('serves plain text', async () => {
    const response = await GET();

    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await response.text()).toContain('# Cicero');
  });
});
