import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  DEMO_ENTRY_LINKS,
  DEMO_PUBLIC_LINKS,
  DEMO_PUBLIC_SITE_LINK,
} from '@/lib/demo-entry-links';
import { GlobalFooterContent } from './index';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe('GlobalFooter links', () => {
  it('describes the product without leading with its license', () => {
    const html = renderToStaticMarkup(<GlobalFooterContent demoAvailable={false} />);

    expect(html).toContain('Open source and self-hostable conference operations');
    expect(html).not.toContain('MIT licensed');
  });

  it('does not advertise role tours on an unseeded instance', () => {
    const html = renderToStaticMarkup(<GlobalFooterContent demoAvailable={false} />);

    expect(html).toContain('aria-label="Cicero resource and creator links"');
    expect(html).not.toContain('Organizer demo');
    for (const href of Object.values(DEMO_ENTRY_LINKS)) expect(html).not.toContain(href);
    for (const href of Object.values(DEMO_PUBLIC_LINKS)) expect(html).not.toContain(`"${href}"`);
  });

  /**
   * The destinations are the contract here, not the wording: these two links are the only way to
   * reach agent setup and the API reference from a page that is not the landing page. Assert the
   * hrefs first so a future relabel cannot quietly drop either one.
   */
  it('keeps agent setup, the embed samples, and API docs available on every instance', () => {
    const html = renderToStaticMarkup(<GlobalFooterContent demoAvailable={false} />);

    expect(html).toContain('href="/#agent-quick-start"');
    expect(html).toContain('<span>Agents</span>');
    // The showcase explains itself on an unseeded instance, so it needs no demo gate of its own.
    expect(html).toContain('href="/embeds"');
    expect(html).toContain('<span>Embeds</span>');
    expect(html).toContain('href="/docs/api"');
    expect(html).toContain('<span>API</span>');
  });

  it('sends API docs to the rendered reference rather than the raw spec', () => {
    const html = renderToStaticMarkup(<GlobalFooterContent demoAvailable={false} />);

    expect(html).not.toContain('href="/api/v1/openapi.json"');
  });

  /**
   * The button had a divider and a margin of its own, which cost the flex line enough room to drop
   * it onto a row by itself. Nothing but whitespace should sit between the last social link and it.
   */
  it('keeps free merch on the same row as the social links', () => {
    const html = renderToStaticMarkup(<GlobalFooterContent demoAvailable />);

    const [, betweenSocialsAndMerch] = html.split('myhandleisbest');
    expect(betweenSocialsAndMerch).toBeDefined();
    expect(betweenSocialsAndMerch.slice(0, betweenSocialsAndMerch.indexOf('Free merch'))).not.toContain(
      'divider',
    );
  });

  it('keeps all seeded role tours available', () => {
    const html = renderToStaticMarkup(<GlobalFooterContent demoAvailable />);

    expect(html).toContain('Organizer demo');
    expect(html).toContain('Reviewer demo');
    expect(html).toContain('Speaker demo');
    for (const href of Object.values(DEMO_ENTRY_LINKS)) expect(html).toContain(href.replaceAll('&', '&amp;'));
  });

  it('offers the published sample event beside the role tours', () => {
    const html = renderToStaticMarkup(<GlobalFooterContent demoAvailable />);

    expect(html).toContain(`href="${DEMO_PUBLIC_SITE_LINK}"`);
    expect(html).toContain('Sample event');
    expect(html.indexOf('Speaker demo')).toBeLessThan(html.indexOf('Sample event'));
  });

  /** The sample event lives in the same seed as the role identities, so it goes when they do. */
  it('hides the sample event on an unseeded instance', () => {
    const html = renderToStaticMarkup(<GlobalFooterContent demoAvailable={false} />);

    expect(html).not.toContain(`href="${DEMO_PUBLIC_SITE_LINK}"`);
    expect(html).not.toContain('Sample event');
  });

  /**
   * Two rows, not one long wrapping line: what the product does, then who made it. A row split that
   * exists only because the links happen to wrap is not a split, so assert the markup carries it.
   */
  it('groups the links into a product row and a creator row', () => {
    const html = renderToStaticMarkup(<GlobalFooterContent demoAvailable />);

    expect(html.match(/class="[^"]*row[^"]*"/g) ?? []).toHaveLength(2);
    for (const productLink of [
      'Organizer demo',
      'Sample event',
      '<span>Agents</span>',
      '<span>API</span>',
    ]) {
      expect(html.indexOf(productLink)).toBeLessThan(html.indexOf('<span>GitHub</span>'));
    }
    expect(html.indexOf('<span>LinkedIn</span>')).toBeLessThan(html.indexOf('Free merch'));
  });

  /** One row is still one row on a fresh instance: resources and creators must not merge. */
  it('keeps both rows when the demo tours are unavailable', () => {
    const html = renderToStaticMarkup(<GlobalFooterContent demoAvailable={false} />);

    expect(html.match(/class="[^"]*row[^"]*"/g) ?? []).toHaveLength(2);
  });
});
