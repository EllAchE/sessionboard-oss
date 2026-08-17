import { readFileSync } from 'node:fs';
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
  it('offers both sign in and sign up whatever the caller passes', () => {
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
      expect(html).toContain('Create an event');
    }
  });

  /**
   * The label is load-bearing, not decoration. `/signup` lands on a screen about running a
   * conference, and "Sign up" promised nothing of the sort, so a visitor who came to speak or
   * review found themselves in the organizer's setup flow with no warning.
   */
  it('says where the primary call to action leads rather than only that it signs you up', () => {
    const html = renderToStaticMarkup(<SiteNav links={LINKS} demoAvailable={false} />);

    expect(html).not.toContain('>Sign up<');
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

  /**
   * The demo menu introduces itself once per browser, which it can only know from `localStorage`.
   * The server has none, so the panel has to render closed and noteless there and open after mount
   * instead: a first paint that disagrees with the markup is a hydration error on every page this
   * navigation appears on.
   */
  it('renders the demo menu closed and without its first-visit note on the server', () => {
    const html = renderToStaticMarkup(<SiteNav links={LINKS} demoAvailable />);

    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('Smol team');
    expect(html).not.toContain('Each link opens the same seeded conference');
    // The five destinations themselves still ship server-rendered, hidden until the panel opens.
    expect(html).toContain('Organizer demo');
    expect(html).toContain('Embed showcase');
  });

  /**
   * The flag carries its version, so a later note can show itself once more by incrementing it. A
   * key without one can only be re-shown by renaming it, which is the same change with no record of
   * why it happened.
   */
  it('versions the key that remembers the introduction', () => {
    const source = readFileSync(new URL('./DemoMenu.tsx', import.meta.url), 'utf8');
    const key = source.match(/INTRODUCED_KEY = '([^']+)'/)?.[1];

    expect(key).toMatch(/^cicero:demos-introduced:v\d+$/);
  });
});

/**
 * Vitest resolves a CSS module to a proxy that returns the key as the class name, so a class the
 * stylesheet never defines renders identically to one it does and only the stylesheet knows the
 * difference. `app/page.test.tsx` guards the home page's module this way; this guards the menu's.
 */
describe('DemoMenu stylesheet', () => {
  it('defines every class the component asks it for', () => {
    const source = readFileSync(new URL('./DemoMenu.tsx', import.meta.url), 'utf8');
    const stylesheet = readFileSync(new URL('./DemoMenu.module.css', import.meta.url), 'utf8');

    const used = new Set([...source.matchAll(/\bstyles\.([A-Za-z][\w-]*)/g)].map(([, name]) => name));
    expect(used.size).toBeGreaterThan(5);

    const defined = new Set(
      [...stylesheet.matchAll(/\.([A-Za-z][\w-]*)/g)].map(([, name]) => name),
    );
    expect([...used].filter((name) => !defined.has(name))).toEqual([]);
  });
});
