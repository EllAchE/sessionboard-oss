import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEMO_ENTRY_LINKS } from '@/lib/demo-entry-links';
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
  });

  /**
   * The destinations are the contract here, not the wording: these two links are the only way to
   * reach agent setup and the API reference from a page that is not the landing page. Assert the
   * hrefs first so a future relabel cannot quietly drop either one.
   */
  it('keeps agent setup and API docs available on every instance', () => {
    const html = renderToStaticMarkup(<GlobalFooterContent demoAvailable={false} />);

    expect(html).toContain('href="/#agent-quick-start"');
    expect(html).toContain('<span>Agents</span>');
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
});
