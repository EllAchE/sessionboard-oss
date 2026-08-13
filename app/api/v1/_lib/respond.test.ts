import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseBody, parseQuery } from './respond';
import { createSubmissionBody, sessionListQuery, submissionListQuery } from './schemas';

describe('parseQuery', () => {
  it('accepts a single bounded value', () => {
    expect(parseQuery(sessionListQuery, new URL('https://example.test?track=Security'))).toEqual({
      track: 'Security',
    });
  });

  it.each([
    'https://example.test?status=published&status=cancelled',
    'https://example.test?unexpected=value',
    `https://example.test?track=${'x'.repeat(121)}`,
    'https://example.test?track=%00hidden',
    'https://example.test?track=%E0%A4%A',
  ])('rejects ambiguous or unsupported query input: %s', (url) => {
    expect(() => parseQuery(sessionListQuery, new URL(url))).toThrow('query parameters');
  });

  it.each(['0', '-1', '1.5', '1e2', '201'])(
    'rejects an ambiguous or out-of-range limit: %s',
    (limit) => {
      expect(() =>
        parseQuery(submissionListQuery, new URL(`https://example.test?limit=${limit}`)),
      ).toThrow('query parameters');
    },
  );
});

describe('parseBody', () => {
  const schema = z.object({ value: z.string() }).strict();

  it('accepts a JSON request within the byte limit', async () => {
    const request = new Request('https://example.test', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ value: 'ok' }),
    });

    await expect(parseBody(schema, request)).resolves.toEqual({ value: 'ok' });
  });

  it('rejects a body without a JSON media type', async () => {
    const request = new Request('https://example.test', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ value: 'ok' }),
    });

    await expect(parseBody(schema, request)).rejects.toThrow('Content-Type');
  });

  it('rejects malformed JSON', async () => {
    const request = new Request('https://example.test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });

    await expect(parseBody(schema, request)).rejects.toThrow('JSON body');
  });

  it('rejects duplicate JSON object keys', async () => {
    const request = new Request('https://example.test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"value":"first","value":"second"}',
    });

    await expect(parseBody(schema, request)).rejects.toThrow('Duplicate JSON object keys');
  });

  it('rejects excessive JSON nesting before schema validation', async () => {
    const body = `${'['.repeat(33)}0${']'.repeat(33)}`;
    const request = new Request('https://example.test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });

    await expect(parseBody(z.unknown(), request)).rejects.toThrow('nested too deeply');
  });

  it('rejects a streamed body once the actual byte limit is exceeded', async () => {
    const request = new Request('https://example.test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(512 * 1024) }),
    });

    await expect(parseBody(schema, request)).rejects.toThrow('too large');
  });
});

describe('published request schemas', () => {
  it('rejects unknown body keys and oversized answer values', () => {
    expect(
      createSubmissionBody.safeParse({
        email: 'ada@example.com',
        answers: {},
        unexpected: true,
      }).success,
    ).toBe(false);
    expect(
      createSubmissionBody.safeParse({
        email: 'ada@example.com',
        answers: { abstract: 'x'.repeat(20_001) },
      }).success,
    ).toBe(false);
  });

  it('bounds answer cardinality', () => {
    const answers = Object.fromEntries(
      Array.from({ length: 101 }, (_, index) => [`field-${index}`, 'value']),
    );
    expect(createSubmissionBody.safeParse({ email: 'ada@example.com', answers }).success).toBe(
      false,
    );
  });
});
