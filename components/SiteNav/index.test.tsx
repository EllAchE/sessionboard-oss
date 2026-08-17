import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SiteNav } from './index';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const LINKS = [
  { href: '/#products', label: 'Product' },
  { href: '/docs/api', label: 'API' },
];

describe('SiteNav', () => {
  /**
   * The reason this component exists. `/embeds` was a copy of the home bar that lost the Sign in
   * link on the way, so the page showcasing the product turned away everyone who already had an
   * account. The auth pair is the component's own, not a caller's, and no combination of props may
   * produce one without the other.
   */
  it('offers both sign in and event creation whatever the caller passes', () => {
    for (const props of [
      { links: LINKS, demoAvailable: true },
      { links: LINKS, demoAvailable: false },
      { links: [], demoAvailable: true },
      { links: [], demoAvailable: false },
    ]) {
      const html = renderToStaticMarkup(<SiteNav {...props} />);

      expect(html).toContain('href="/signin"');
      expect(html).toContain('Sign in');
      expect(html).toContain('href="/signup"');
      expect(html).toContain('Create event');
    }
  });

  it('names itself for assistive technology and sends the brand home', () => {
    const html = renderToStaticMarkup(<SiteNav links={LINKS} demoAvailable={false} />);

    expect(html).toContain('aria-label="Primary navigation"');
    expect(html).toContain('aria-label="Cicero home"');
    expect(html).toContain('href="/"');
  });

  it('renders the contextual links the caller asked for, in order', () => {
    const html = renderToStaticMarkup(<SiteNav links={LINKS} demoAvailable={false} />);

    for (const link of LINKS) {
      expect(html).toContain(`href="${link.href}"`);
      expect(html).toContain(link.label);
    }
    expect(html.indexOf('/#products')).toBeLessThan(html.indexOf('/docs/api'));
  });

  /** The demo routes 404 on an instance with no seeded event, so the menu is gated on the seed. */
  it('shows the demo menu only where the demos exist', () => {
    expect(renderToStaticMarkup(<SiteNav links={LINKS} demoAvailable />)).toContain('Demos');
    expect(renderToStaticMarkup(<SiteNav links={LINKS} demoAvailable={false} />)).not.toContain(
      'Demos',
    );
  });

  /** `heroOf` in `app/page.test.tsx` slices the markup on `</nav>`, and screen readers count them. */
  it('emits exactly one nav element', () => {
    const html = renderToStaticMarkup(<SiteNav links={LINKS} demoAvailable />);

    expect(html.match(/<nav/g)).toHaveLength(1);
  });
});
