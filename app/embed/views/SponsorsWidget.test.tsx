import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parseEmbedOptions, type PublicSponsor } from '../model';
import { SponsorsWidget } from './SponsorsWidget';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const sponsors: PublicSponsor[] = [
  {
    id: 'sponsor-1',
    kind: 'sponsor',
    name: 'Aqua Marcia',
    tier: 'Principal',
    websiteUrl: 'https://example.test/aqua',
    description: 'Keeps the city supplied.',
    boothLocation: null,
    logoUrl: '/forum/sponsors/logo/logo-1',
  },
  {
    id: 'exhibitor-1',
    kind: 'exhibitor',
    name: 'Officina Ferraria',
    tier: null,
    websiteUrl: null,
    description: 'Survey instruments.',
    boothLocation: 'B14',
    logoUrl: null,
  },
];

describe('SponsorsWidget', () => {
  it('renders sponsor and exhibitor groups with scoped logos and booth details', () => {
    const html = renderToStaticMarkup(
      <SponsorsWidget sponsors={sponsors} options={parseEmbedOptions({})} />,
    );

    expect(html).toContain('Sponsors');
    expect(html).toContain('Exhibitors');
    expect(html).toContain('Principal');
    expect(html).toContain('Booth B14');
    expect(html).toContain('src="/forum/sponsors/logo/logo-1"');
  });

  it('honors the shared description visibility option', () => {
    const html = renderToStaticMarkup(
      <SponsorsWidget sponsors={sponsors} options={parseEmbedOptions({ description: '0' })} />,
    );

    expect(html).not.toContain('Keeps the city supplied.');
    expect(html).not.toContain('Survey instruments.');
  });

  it('has a stable empty state when no row is published', () => {
    const html = renderToStaticMarkup(
      <SponsorsWidget sponsors={[]} options={parseEmbedOptions({})} />,
    );
    expect(html).toContain('No sponsors are published yet.');
  });
});
