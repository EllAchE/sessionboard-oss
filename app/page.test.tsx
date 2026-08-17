import { ToastProvider } from '@/components/ui';
import { DEMO_ENTRY_LINKS } from '@/lib/demo-entry-links';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

vi.mock('next/image', () => ({
  default: ({
    priority,
    alt,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => {
    void priority;
    // eslint-disable-next-line @next/next/no-img-element -- a test stub for Next's image component
    return <img alt={alt ?? ''} {...props} />;
  },
}));

const { HomeContent } = await import('./page');
const renderHome = (demoAvailable: boolean) =>
  renderToStaticMarkup(
    <ToastProvider>
      <HomeContent demoAvailable={demoAvailable} />
    </ToastProvider>,
  );

/** As the markup escapes it, since every demo sign-in URL carries query parameters. */
const asAttribute = (href: string) => href.replaceAll('&', '&amp;');

/** Everything between the navigation and the role cards, which is exactly the hero. */
const heroOf = (html: string) =>
  html.slice(html.indexOf('</nav>'), html.indexOf('id="products"'));

describe('home page', () => {
  it('leads with a concise copyable setup prompt', () => {
    const html = renderHome(false);

    expect(html).toContain('AI-guided setup');
    expect(html).toContain('Copy prompt');
    expect(html).not.toContain('Copy AI setup prompt');
    expect(html).not.toContain('Let Claude or ChatGPT walk through setup with you');
    expect(html).toContain('Claude &amp; ChatGPT setup prompt');
    expect(html.indexOf('Copy prompt')).toBeLessThan(html.indexOf('Create an event'));
    expect(html).toContain(
      'https://github.com/EllAchE/sessionboard-oss/blob/main/.agents/skills/onboard-cicero/SKILL.md',
    );
  });

  it('keeps the hero to the pitch and the two ways to start an event', () => {
    const hero = heroOf(renderHome(true));

    expect(hero).toContain('From call for speakers to first day');
    expect(hero).toContain('AI-guided setup');
    expect(hero).toContain('Create an event');
    // The demo belongs to the role cards below, so the hero must not race them for the click.
    expect(hero).not.toContain('href="/demo');
    for (const href of Object.values(DEMO_ENTRY_LINKS)) {
      expect(hero).not.toContain(asAttribute(href));
    }
  });

  it('makes every role card its own way into the demo', () => {
    const html = renderHome(true);
    const products = html.slice(html.indexOf('id="products"'), html.indexOf('id="about"'));

    expect(products).toContain('One conference, four purpose-built experiences.');
    for (const role of ['Organizer', 'Reviewer', 'Speaker', 'Attendee']) {
      expect(products).toContain(role);
    }
    // One entry point per role: three seeded sign-ins plus the published agenda, which needs none.
    for (const href of [...Object.values(DEMO_ENTRY_LINKS), '/demo/agenda']) {
      expect(products).toContain(`href="${asAttribute(href)}"`);
    }
    // Distinct first words, because walkthroughs match link text from its start and treat a second
    // match as an error. The footer's `Organizer demo` / `Reviewer demo` / `Speaker demo` share this
    // page, so the role nouns and their stems are unavailable here.
    for (const label of [
      'Run the organizer dashboard',
      'Score the review queue',
      'Give a talk from the portal',
      'Browse the public agenda',
    ]) {
      expect(products).toContain(label);
    }
    const firstWords = [...products.matchAll(/<a [^>]*href="[^"]*"[^>]*>\s*(\S+)/g)].map(
      ([, word]) => word,
    );
    expect(firstWords).toHaveLength(4);
    expect(new Set(firstWords).size).toBe(firstWords.length);
  });

  it('drops the marketing sections the role cards replaced', () => {
    const html = renderHome(true);

    expect(html).not.toContain('Keep the entire conference moving.');
    expect(html).not.toContain('Give reviewers a queue they can finish.');
    expect(html).not.toContain('Give speakers one clear place to get ready.');
    expect(html).not.toContain('Publish once. Keep every public view in sync.');
    expect(html).not.toContain('Explore a conference already in motion');
    expect(html).not.toContain('For reviewers');
    expect(html).not.toContain('For speakers');
    expect(html).toContain('Open source and self-hostable');
    expect(html).not.toContain('MIT');
    expect(html).not.toContain('License');
    expect(html).not.toMatch(
      /\b(?:forum|empire|imperial|petition|orator|fasti|magistrate|province|decree)\b/i,
    );
  });

  it('makes products and docs discoverable from the primary navigation', () => {
    const html = renderHome(false);

    expect(html).toContain('href="#products"');
    expect(html).toContain('Products');
    expect(html).toContain('href="/docs/api"');
    expect(html).toContain('>API<');
    expect(html).not.toContain('Agent quick start');
  });

  it('orders the navigation about, products, docs, then demo', () => {
    const html = renderHome(true);

    const navOrder = ['href="#about"', 'href="#products"', 'href="/docs/api"'].map(
      (marker) => html.indexOf(marker),
    );
    expect(navOrder).toEqual([...navOrder].sort((first, second) => first - second));
    expect(navOrder.at(-1)).toBeLessThan(html.indexOf('>Demos'));
  });

  it('collects every demo behind the navigation demo menu', () => {
    const html = renderHome(true);

    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('Organizer dashboard');
    expect(html).toContain('Reviewer queue');
    expect(html).toContain('Speaker portal');
    expect(html).toContain('Public event page');
    expect(html).toContain('Public agenda');
  });

  it('keeps agent setup reachable from the page body once it leaves the navigation', () => {
    const html = renderHome(false);

    expect(html).toContain('href="#agent-quick-start"');
    expect(html).toContain('Set up with an AI guide');
  });

  it('offers only working cold-start paths before the demo fixture is loaded', () => {
    const html = renderHome(false);

    expect(html).toContain('Fresh instance');
    expect(html).toContain('Start your first event');
    expect(html).toContain('href="/signup"');
    expect(html).not.toContain('href="/demo"');
    expect(html).not.toContain('href="/demo/agenda"');
    for (const href of Object.values(DEMO_ENTRY_LINKS)) {
      expect(html).not.toContain(asAttribute(href));
    }
    // The role cards still describe the product; only their demo links stand down.
    expect(html).toContain('One conference, four purpose-built experiences.');
    for (const label of ['Run the organizer dashboard', 'Browse the public agenda']) {
      expect(html).not.toContain(label);
    }
  });

  it('drops the cold-start note once the demo fixture is loaded', () => {
    const html = renderHome(true);

    expect(html).not.toContain('Fresh instance');
    expect(html).toContain('href="/signup"');
  });
});
