import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEMO_ENTRY_LINKS } from '@/lib/demo-entry-links';
import { GlobalFooterContent } from './index';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe('GlobalFooter demo links', () => {
  it('does not advertise role tours on an unseeded instance', () => {
    const html = renderToStaticMarkup(<GlobalFooterContent demoAvailable={false} />);

    expect(html).toContain('aria-label="Cicero creator and source links"');
    expect(html).not.toContain('Organizer demo');
    for (const href of Object.values(DEMO_ENTRY_LINKS)) expect(html).not.toContain(href);
  });

  it('keeps all seeded role tours available', () => {
    const html = renderToStaticMarkup(<GlobalFooterContent demoAvailable />);

    expect(html).toContain('Organizer demo');
    expect(html).toContain('Reviewer demo');
    expect(html).toContain('Speaker demo');
    for (const href of Object.values(DEMO_ENTRY_LINKS)) expect(html).toContain(href.replaceAll('&', '&amp;'));
  });
});
