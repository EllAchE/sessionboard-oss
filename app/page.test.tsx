import { ToastProvider } from '@/components/ui';
import {
  DEMO_ENTRY_LINKS,
  DEMO_EVENT_SLUG,
  DEMO_PUBLIC_LINKS,
  DEMO_PUBLIC_SITE_LINK,
  DEMO_TOURS,
} from '@/lib/demo-entry-links';
import { readFileSync } from 'node:fs';
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
    // Scoped to the hero: the bar above it now carries the same "Create an event" label, so an
    // unscoped indexOf would find the nav button and compare against the wrong one.
    const hero = heroOf(html);
    expect(hero.indexOf('Copy prompt')).toBeLessThan(hero.indexOf('Create an event'));
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
    expect(html).toContain('Let your agent handle the boring work.');
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
    // `Open source and self-hostable` led a section here, and now leads the global footer alone.
    expect(html).not.toContain('Open source and self-hostable');
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
      'Explore a conference already in motion.',
      'Run your own conference.',
    ]) {
      expect(html).not.toContain(heading);
    }
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
    // Ends at the agent section, whose two guide links are not role cards and carry their own labels.
    const products = html.slice(html.indexOf('id="products"'), html.indexOf('id="agent-quick-start"'));

    expect(html).not.toContain('Or explore a conference already in progress');
    for (const [label, href] of [
      ['Run the conference', DEMO_ENTRY_LINKS.organizer],
      ['Score the proposals', DEMO_ENTRY_LINKS.reviewer],
      ['Give a talk', DEMO_ENTRY_LINKS.speaker],
      ['Browse the programme', DEMO_PUBLIC_SITE_LINK],
    ] as const) {
      expect(products).toContain(`href="${asAttribute(href)}">${label}`);
    }

    const firstWords = [...products.matchAll(/<a [^>]*href="[^"]*"[^>]*>\s*(\S+)/g)].map(
      (match) => match[1],
    );
    expect(firstWords).toHaveLength(4);
    expect(new Set(firstWords).size).toBe(4);
  });

  /*
   * The `For attendees` section is gone by request: its heading, its five deep links into the
   * seeded event's public pages, and its `/embeds` link. This page previously lost that section to
   * a merge rather than a decision -- it landed on main in #254 after the page's rewrite was
   * written, and the conflict resolution deleted it as "not mine" with every check green -- so the
   * removal is asserted here rather than left to whichever way the next merge falls.
   *
   * `DEMO_PUBLIC_LINKS.event` is exempt: it is `DEMO_PUBLIC_SITE_LINK`, which the attendee role
   * card above still opens.
   */
  it('carries no attendee section', () => {
    for (const html of [renderHome(true), renderHome(false)]) {
      expect(html).not.toContain('id="attendees"');
      expect(html).not.toContain('Give attendees the programme, not a PDF.');
      expect(html).not.toContain('For attendees');

      const deepLinks = Object.entries(DEMO_PUBLIC_LINKS).filter(([page]) => page !== 'event');
      for (const [, href] of deepLinks) {
        expect(html).not.toContain(`href="${href}"`);
      }
      expect(html).not.toContain('See every embed running live');
      expect(html).not.toContain('See what the embeds publish');
    }
  });

  /*
   * The attendee section that used to sit here framed a live `/embed/.../gallery` iframe under a
   * class this page's stylesheet never defined, so it rendered unconstrained between two centred
   * neighbours and took a screenful to say what a link says in a line. `/embeds` runs every widget
   * against the real conference; nothing on the landing page needs to run one of them inline.
   */
  it('runs no embed inline', () => {
    const html = renderHome(true);

    expect(html).not.toContain('<iframe');
    expect(html).not.toContain(`/embed/${DEMO_EVENT_SLUG}/gallery`);
  });

  /**
   * The attendee section asked for `styles.product`, which `home.module.css` never defined, so it
   * rendered classless and full-bleed while every neighbour stayed centred at the page measure.
   * Nothing caught it: vitest resolves a CSS module to a proxy that hands back the key as the class
   * name, so the markup looks identical either way and only the stylesheet knows. Read it.
   */
  it('defines every class the page asks its stylesheet for', () => {
    const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
    const stylesheet = readFileSync(new URL('./home.module.css', import.meta.url), 'utf8');

    const used = new Set(
      [...source.matchAll(/\bstyles\.([A-Za-z][\w-]*)/g)].map(([, name]) => name),
    );
    expect(used.size).toBeGreaterThan(10);

    const defined = new Set(
      [...stylesheet.matchAll(/\.([A-Za-z][\w-]*)/g)].map(([, name]) => name),
    );
    expect([...used].filter((name) => !defined.has(name))).toEqual([]);
  });

  it('runs the role cards straight into agent setup', () => {
    const html = renderHome(true);

    expect(html.indexOf('id="products"')).toBeLessThan(html.indexOf('id="agent-quick-start"'));
  });

  it('publishes no seeded link on a fresh instance', () => {
    const html = renderHome(false);

    expect(html).not.toContain('<iframe');
    for (const href of Object.values(DEMO_PUBLIC_LINKS)) {
      expect(html).not.toContain(`href="${href}"`);
    }
  });

  it('makes products and docs discoverable from the primary navigation', () => {
    const html = renderHome(false);

    expect(html).toContain('href="#products"');
    expect(html).toContain('Products');
    expect(html).toContain('href="/docs/api"');
    expect(html).toContain('>API<');
    expect(html).not.toContain('Agent quick start');
  });

  it('orders the navigation products, docs, then demo', () => {
    const html = renderHome(true);

    // `About` led this list and pointed at a section that is gone; nothing anchors to it now.
    expect(html).not.toContain('href="#about"');
    expect(html).not.toContain('id="about"');

    const navOrder = ['href="#products"', 'href="/docs/api"'].map((marker) => html.indexOf(marker));
    expect(navOrder).toEqual([...navOrder].sort((first, second) => first - second));
    expect(navOrder.at(-1)).toBeLessThan(html.indexOf('>Demos'));
  });

  /**
   * The menu and the footer's first row offer the same five destinations under the same five names,
   * from the one `DEMO_TOURS` list. They used to disagree on both: `Organizer dashboard` here where
   * the footer said `Organizer demo`, and a fifth entry of `Public agenda` -- one page of the
   * published event listed above it -- where the footer offered the embed showcase.
   */
  it('collects every demo behind the navigation demo menu, named as the footer names them', () => {
    const html = renderHome(true);

    expect(html).toContain('aria-expanded="false"');
    for (const { href, label } of DEMO_TOURS) {
      expect(html).toContain(label);
      expect(html).toContain(`href="${href.replaceAll('&', '&amp;')}"`);
    }
    expect(html).not.toContain('Public agenda');
    expect(html).not.toContain('Organizer dashboard');
  });

  /**
   * The agent section is still on the page, but the in-body anchor to it went with the `About`
   * section that held it. The footer's `Agents` entry is the remaining link, and it is absolute
   * (`/#agent-quick-start`) because the footer renders on every page.
   */
  it('keeps the agent section on the page once the anchor to it is gone', () => {
    const html = renderHome(false);

    expect(html).toContain('id="agent-quick-start"');
    expect(html).not.toContain('Set up with an AI guide');
  });

  /**
   * What the removed `About` section claimed, and where each claim lives now that its paragraph is
   * gone: it promised the API, the embeds, and agent extensibility, and each of those is a thing
   * this page shows rather than asserts. Its `View source on GitHub` link moved to the footer,
   * whose `GitHub` entry is the author's profile rather than the repository.
   */
  it('shows what the about paragraph used to promise, and asserts none of it', () => {
    const html = renderHome(true);

    expect(html).toContain('href="/docs/api"');
    expect(html).toContain('href="/embeds"');
    expect(html).toContain('id="agent-quick-start"');
    for (const dropped of [
      'REST API and webhooks',
      'Live embeddable views',
      'Role-scoped agents',
      'Build on the workflow, not around it.',
      'without waiting on a vendor roadmap',
      'View source on GitHub',
    ]) {
      expect(html).not.toContain(dropped);
    }
  });

  it('offers only working cold-start paths before the demo fixture is loaded', () => {
    const html = renderHome(false);

    expect(html).toContain('Fresh instance');
    expect(html).toContain('href="/signup"');
    expect(html).not.toContain('href="/demo"');
    for (const href of Object.values(DEMO_ENTRY_LINKS)) expect(html).not.toContain(href);
  });

  it('restores every public and role tour after the demo fixture is loaded', () => {
    const html = renderHome(true);

    expect(html).toContain('href="/demo"');
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
   * matches as an error. The demo menu and the footer's first row now name the same five
   * destinations identically on purpose, so text alone no longer identifies a target across the
   * whole page and a walkthrough has to scope its match to one surface first. What still has to
   * hold is that within the menu, and against the role cards in the page body, no label is a prefix
   * of another -- otherwise scoping does not rescue it either.
   */
  it('keeps every demo tour label separable from the start of its text', () => {
    const html = renderHome(true);
    const labels = [
      'Run the conference',
      'Score the proposals',
      'Give a talk',
      'Browse the programme',
      ...DEMO_TOURS.map((tour) => tour.label),
    ];

    for (const label of labels) {
      expect(html).toContain(label);
      expect(labels.filter((other) => other.startsWith(label))).toEqual([label]);
    }
  });
});
