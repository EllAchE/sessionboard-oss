import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import spec from '@/docs/openapi.json';
import ApiDocsPage from './page';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

/**
 * The page is a projection of the committed spec, so the test is too: it asserts the projection
 * covers everything rather than pinning a handful of paths that would go stale the moment an
 * endpoint is added.
 */
describe('API reference page', () => {
  const html = renderToStaticMarkup(<ApiDocsPage />);

  it('lists every path in the spec', () => {
    for (const path of Object.keys(spec.paths)) {
      expect(html, `${path} is missing from the reference`).toContain(path);
    }
  });

  it('points at the machine-readable spec it was generated from', () => {
    expect(html).toContain('href="/api/v1/openapi.json"');
  });

  it('says which credential an endpoint wants', () => {
    expect(html).toContain('Public');
    expect(html).toContain('Event API key');
    expect(html).toContain('Speaker session');
  });
});
