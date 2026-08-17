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

  it('keeps agent setup and API docs available on every instance', () => {
    const html = renderToStaticMarkup(<GlobalFooterContent demoAvailable={false} />);

    expect(html).toContain('href="/#agent-quick-start"');
    expect(html).toContain('Agent setup');
    expect(html).toContain('href="/api/v1/openapi.json"');
    expect(html).toContain('API docs');
  });

  it('keeps all seeded role tours available', () => {
    const html = renderToStaticMarkup(<GlobalFooterContent demoAvailable />);

    expect(html).toContain('Organizer demo');
    expect(html).toContain('Reviewer demo');
    expect(html).toContain('Speaker demo');
    for (const href of Object.values(DEMO_ENTRY_LINKS)) expect(html).toContain(href.replaceAll('&', '&amp;'));
  });
});
