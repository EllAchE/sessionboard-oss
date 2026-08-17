import { ToastProvider } from '@/components/ui';
import { DEMO_ENTRY_LINKS, DEMO_PUBLIC_SITE_LINK } from '@/lib/demo-entry-links';
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

/** Everything between the navigation and the role cards, which is exactly the hero. */
const heroOf = (html: string) => html.slice(html.indexOf('</nav>'), html.indexOf('id="products"'));

/** As the markup escapes it, since every demo sign-in URL carries query parameters. */
const asAttribute = (href: string) => href.replaceAll('&', '&amp;');

describe('fresh-instance home page', () => {
  it('leads with a concise copyable setup prompt', () => {
    const html = renderHome(false);

    expect(html).toContain('AI-guided setup');
    expect(html).toContain('Copy prompt');
    expect(html).not.toContain('Copy AI setup prompt');
    expect(html).not.toContain('Let Claude or ChatGPT walk through setup with you');
    expect(html).toContain('Paste into your agent');
    expect(html).toContain('alt="OpenAI"');
    expect(html).toContain('alt="Anthropic Claude"');
    expect(html).toContain('alt="Google Antigravity"');
    expect(html).toContain('+ more');
    expect(html.indexOf('Copy prompt')).toBeLessThan(html.indexOf('Create an event'));
    expect(html).toContain(
      'https://github.com/EllAchE/sessionboard-oss/blob/main/.agents/skills/onboard-cicero/SKILL.md',
    );
  });

  /**
   * The prompt is one instruction and one URL on purpose. It used to restate the whole onboarding
   * contract, which both buried the section under a wall of monospace and duplicated rules that
   * `onboard-cicero/SKILL.md` already owns. Guard the size, not the exact wording.
   */
  it('keeps the pasted setup prompt to a single short instruction', () => {
    const html = renderHome(false);
    const prompt = html.slice(html.indexOf('Set up Cicero for my conference'));

    expect(prompt.slice(0, 400)).toContain('onboard-cicero/SKILL.md');
    expect(html).not.toContain('Walk me through one unfinished milestone at a time');
    expect(html).not.toContain('hand off to $manage-cicero-event');
  });

  /**
   * The MCP server is deployed and event-scoped, so the section leads with the endpoint and states
   * the API-key prerequisite rather than implying the integration is unavailable.
   */
  it('leads the agent section with the MCP server and its key prerequisite', () => {
    const html = renderHome(false);

    expect(html).toContain('MCP server');
    expect(html).toContain('/api/v1/events/{event-slug}/mcp');
    expect(html).toContain('href="/api/v1/mcp-tools.json"');
    expect(html).toContain('event API key as a Bearer token');
    expect(html).toContain('Integrations');
    expect(html).toContain('Let your AI assistant handle the hard work.');
    expect(html.indexOf('MCP server')).toBeLessThan(html.indexOf('Paste into your agent'));
    expect(html).not.toContain('setup checklist');
  });

  it('describes the product through organizer, reviewer, speaker, and attendee outcomes', () => {
    const html = renderHome(true);

    expect(html).toContain('From call for speakers to first day');
    expect(html).toContain('One conference, four purpose-built experiences.');
    expect(html).toContain('Keep the whole conference moving.');
    expect(html).toContain('Score proposals, not spreadsheets.');
    expect(html).toContain('Stay ready from proposal to stage.');
    expect(html).toContain('Plan the day from the live programme.');
    expect(html).toContain('Open source and self-hostable');
    expect(html).not.toContain('MIT');
    expect(html).not.toContain('License');
    expect(html).not.toMatch(
      /\b(?:forum|empire|imperial|petition|orator|fasti|magistrate|province|decree)\b/i,
    );
  });

  it('ranks the reviewer above the attendee', () => {
    const html = renderHome(true);

    expect(html.indexOf('Score proposals, not spreadsheets.')).toBeLessThan(
      html.indexOf('Plan the day from the live programme.'),
    );
  });

  /**
   * The page argued the same case three times: four summary role cards, then a full section per
   * role carrying twelve feature cards, then a closing call to action repeating the demo links a
   * fourth time. The role cards carry the demo now, so the rest is gone; these are the headings
   * that would come back with any of it.
   */
  it('drops the marketing sections the role cards replaced', () => {
    const html = renderHome(true);

    for (const heading of [
      'Keep the entire conference moving.',
      'Give reviewers a queue they can finish.',
      'Give speakers one clear place to get ready.',
      'Publish once. Keep every public view in sync.',
      'Give attendees the programme, not a PDF.',
      'Explore a conference already in motion.',
      'Run your own conference.',
    ]) {
      expect(html).not.toContain(heading);
    }
    expect(html).not.toContain('<iframe');
    // The embed showcase keeps its own entry point in the about section.
    expect(html).toContain('href="/embeds"');
  });

  /**
   * The hero sells and the section below it converts. Its three persona demo links used to compete
   * with the setup calls to action above the fold, and they now hang off the role cards instead.
   */
  it('keeps the hero to the pitch and the two ways to start an event', () => {
    const hero = heroOf(renderHome(true));

    expect(hero).toContain('Create an event');
    expect(hero).toContain('AI-guided setup');
    expect(hero).not.toContain('href="/demo');
    for (const href of Object.values(DEMO_ENTRY_LINKS)) {
      expect(hero).not.toContain(asAttribute(href));
    }
  });

  /**
   * Automated walkthroughs match link text from its start and treat two matches as an error, so no
   * two links in the section may share a first word. Checked against what actually rendered rather
   * than against a hand-kept list, which is what let the earlier collisions through.
   */
  it('makes every role card its own way into the demo', () => {
    const html = renderHome(true);
    const products = html.slice(html.indexOf('id="products"'), html.indexOf('id="about"'));

    for (const href of Object.values(DEMO_ENTRY_LINKS)) {
      expect(products).toContain(asAttribute(href));
    }
    expect(products).toContain(`href="${DEMO_PUBLIC_SITE_LINK}"`);

    const firstWords = [...products.matchAll(/<a [^>]*href="[^"]*"[^>]*>\s*(\S+)/g)].map(
      (match) => match[1],
    );
    expect(firstWords).toHaveLength(4);
    expect(new Set(firstWords).size).toBe(4);
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
    expect(html).toContain('href="/signup"');
    expect(html).not.toContain('href="/demo"');
    expect(html).not.toContain('href="/demo/agenda"');
    for (const href of Object.values(DEMO_ENTRY_LINKS)) expect(html).not.toContain(href);
  });

  it('restores every public and role tour after the demo fixture is loaded', () => {
    const html = renderHome(true);

    expect(html).toContain('href="/demo"');
    expect(html).toContain('href="/demo/agenda"');
    for (const href of Object.values(DEMO_ENTRY_LINKS)) expect(html).toContain(href.replaceAll('&', '&amp;'));
    expect(html).not.toContain('Fresh instance');
  });

  /**
   * The published site is what the three role tours produce, so it is offered the same way they
   * are: the fourth role card, after the three that sign the visitor in.
   */
  it('shows the sample published event alongside the role tours', () => {
    const html = renderHome(true);

    expect(html).toContain(`href="${DEMO_PUBLIC_SITE_LINK}"`);
    expect(html).toContain('Browse the programme');
    expect(html.indexOf('Give a talk')).toBeLessThan(html.indexOf('Browse the programme'));
  });

  /**
   * Automated walkthroughs pick a click target by matching link text from the start and treat two
   * matches as an error, so no tour label may be a prefix of another anywhere on the page or in
   * the global footer, which ships `Organizer demo`, `Reviewer demo`, and `Speaker demo`.
   */
  it('keeps every demo tour label separable from the start of its text', () => {
    const html = renderHome(true);
    const labels = [
      'Run the conference',
      'Score the proposals',
      'Give a talk',
      'Browse the programme',
      'Organizer dashboard',
      'Reviewer queue',
      'Speaker portal',
      'Public event page',
      'Public agenda',
    ];

    for (const label of labels) {
      expect(html).toContain(label);
      expect(labels.filter((other) => other.startsWith(label))).toEqual([label]);
    }
  });
});
