import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const { default: NotFound } = await import('./not-found');

describe('app-wide not-found page', () => {
  it('explains the miss and offers a way back that works for any audience', () => {
    const html = renderToStaticMarkup(<NotFound />);

    expect(html).toContain('We could not find that page');
    expect(html).toContain('The link may be out of date');
    expect(html).toContain('href="/"');
  });

  it('renders the way back as a single anchor rather than a nested control', () => {
    const html = renderToStaticMarkup(<NotFound />);

    expect(html).toContain('Go to the home page');
    expect(html).not.toContain('<button');
  });
});
