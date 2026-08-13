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

  it('translates the vocabulary the product actually speaks in', () => {
    const glossary = buildLlmsTxt(ORIGIN).split('## Glossary')[1];

    for (const term of [
      'petition',
      'scroll',
      'orator',
      'oration',
      'fasti',
      'chamber',
      'theme',
      'council',
      'duty',
      'dispatch',
      'inscription',
      'edict',
      'alliance',
      'aqueduct key',
    ]) {
      expect(glossary).toContain(`- ${term}`);
    }
  });

  it('serves plain text', async () => {
    const response = await GET();

    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await response.text()).toContain('# Cicero');
  });
});
