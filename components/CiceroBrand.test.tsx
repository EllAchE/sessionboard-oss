import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CiceroMark } from './CiceroBrand';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe('CiceroMark', () => {
  it('keeps the default brand palette and white tile in every app theme', () => {
    const html = renderToStaticMarkup(<CiceroMark title="Cicero" />);

    expect(html).toContain('fill="var(--stone-0)"');
    expect(html).toContain('fill="var(--vermilion-500)"');
    expect(html).not.toContain('fill="var(--surface-raised)"');
  });
});
