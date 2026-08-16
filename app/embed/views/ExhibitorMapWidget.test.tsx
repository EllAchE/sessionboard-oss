import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parseEmbedOptions } from '../model';
import { ExhibitorMapWidget } from './ExhibitorMapWidget';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe('ExhibitorMapWidget', () => {
  it('renders the current PDF with open and download fallbacks', () => {
    const html = renderToStaticMarkup(
      <ExhibitorMapWidget
        eventName="The Forum"
        file={{ filename: 'floor-plan.pdf', url: '/embed/forum/exhibitor-map/file' }}
        options={parseEmbedOptions({ theme: 'dark', accent: 'b7391f' })}
      />,
    );

    expect(html).toContain('data-embed-view="exhibitor-map"');
    expect(html).toContain('data-theme="dark"');
    expect(html).toContain('floor-plan.pdf');
    expect(html).toContain('data="/embed/forum/exhibitor-map/file"');
    expect(html).toContain('href="/embed/forum/exhibitor-map/file?download=1"');
    expect(html).toContain('The Forum exhibitor map PDF');
  });

  it('renders a stable empty state before an organizer uploads a map', () => {
    const html = renderToStaticMarkup(
      <ExhibitorMapWidget
        eventName="The Forum"
        file={null}
        options={parseEmbedOptions({})}
      />,
    );
    expect(html).toContain('No exhibitor map is published yet.');
    expect(html).not.toContain('<object');
  });
});
