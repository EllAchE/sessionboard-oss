import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEMO_ENTRY_LINKS, DEMO_PUBLIC_LINKS } from '@/lib/demo-entry-links';
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
    expect(html).not.toContain('Attendee demo');
    for (const href of Object.values(DEMO_ENTRY_LINKS)) expect(html).not.toContain(href);
    for (const href of Object.values(DEMO_PUBLIC_LINKS)) expect(html).not.toContain(`"${href}"`);
  });

  it('keeps agent setup, the embed samples, and API docs available on every instance', () => {
    const html = renderToStaticMarkup(<GlobalFooterContent demoAvailable={false} />);

    expect(html).toContain('href="/#agent-quick-start"');
    expect(html).toContain('>Agents<');
    // The showcase explains itself on an unseeded instance, so it needs no demo gate of its own.
    expect(html).toContain('href="/embeds"');
    expect(html).toContain('>Embeds<');
    expect(html).toContain('href="/docs/api"');
    expect(html).toContain('>API<');
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

  it('keeps all seeded role tours available, including the one that needs no account', () => {
    const html = renderToStaticMarkup(<GlobalFooterContent demoAvailable />);

    expect(html).toContain('Organizer demo');
    expect(html).toContain('Reviewer demo');
    expect(html).toContain('Speaker demo');
    expect(html).toContain('Attendee demo');
    expect(html).toContain(`href="${DEMO_PUBLIC_LINKS.event}"`);
    for (const href of Object.values(DEMO_ENTRY_LINKS)) expect(html).toContain(href.replaceAll('&', '&amp;'));
  });
});
