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

describe('fresh-instance home page', () => {
  it('leads with a copyable setup prompt for Claude and ChatGPT', () => {
    const html = renderToStaticMarkup(<HomeContent demoAvailable={false} />);

    expect(html).toContain('Agent-first');
    expect(html).toContain('Copy AI setup prompt');
    expect(html).toContain('Let Claude or ChatGPT set Cicero up and run it for you over MCP');
    expect(html).toContain('Setup prompt');
    expect(html.indexOf('Copy AI setup prompt')).toBeLessThan(html.indexOf('Create an event'));
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
    const html = renderToStaticMarkup(<HomeContent demoAvailable={false} />);
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
    const html = renderToStaticMarkup(<HomeContent demoAvailable={false} />);

    expect(html).toContain('MCP server');
    expect(html).toContain('/api/v1/events/{event-slug}/mcp');
    expect(html).toContain('href="/api/v1/mcp-tools.json"');
    expect(html).toContain('event API key as a Bearer token');
    expect(html).toContain('Integrations');
    expect(html).toContain('Let your AI assistant handle the hard work.');
    expect(html.indexOf('MCP server')).toBeLessThan(html.indexOf('Setup prompt'));
    expect(html).not.toContain('setup checklist');
  });

  it('describes the product through organizer, speaker, and attendee outcomes', () => {
    const html = renderToStaticMarkup(<HomeContent demoAvailable />);

    expect(html).toContain('From call for speakers to public program');
    expect(html).toContain('One conference, three purpose-built experiences.');
    expect(html).toContain('Organizer');
    expect(html).toContain('Speaker');
    expect(html).toContain('Attendee');
    expect(html).toContain('Plan the day from the live programme.');
    expect(html).toContain('For organizers');
    expect(html).toContain('Know what needs attention');
    expect(html).toContain('Build a schedule that catches collisions');
    expect(html).toContain('For speakers');
    expect(html).toContain('Find everything in one portal');
    expect(html).toContain('Send the right files every time');
    expect(html).toContain('Open source and self-hostable');
    expect(html).not.toContain('MIT');
    expect(html).not.toContain('License');
    expect(html).not.toMatch(
      /\b(?:forum|empire|imperial|petition|orator|fasti|magistrate|province|decree)\b/i,
    );
  });

  it('makes products and docs discoverable from the primary navigation', () => {
    const html = renderToStaticMarkup(<HomeContent demoAvailable={false} />);

    expect(html).toContain('href="#products"');
    expect(html).toContain('Products');
    expect(html).toContain('href="/api/v1/openapi.json"');
    expect(html).toContain('>Docs<');
    expect(html).not.toContain('Agent quick start');
  });

  it('keeps agent setup reachable from the page body once it leaves the navigation', () => {
    const html = renderToStaticMarkup(<HomeContent demoAvailable={false} />);

    expect(html).toContain('href="#agent-quick-start"');
    expect(html).toContain('Set up with an AI guide');
  });

  it('offers only working cold-start paths before the demo fixture is loaded', () => {
    const html = renderToStaticMarkup(<HomeContent demoAvailable={false} />);

    expect(html).toContain('Fresh instance');
    expect(html).toContain('Create your first event');
    expect(html).toContain('href="/signup"');
    expect(html).not.toContain('href="/demo"');
    expect(html).not.toContain('href="/demo/agenda"');
    for (const href of Object.values(DEMO_ENTRY_LINKS)) expect(html).not.toContain(href);
  });

  it('restores every public and role tour after the demo fixture is loaded', () => {
    const html = renderToStaticMarkup(<HomeContent demoAvailable />);

    expect(html).toContain('href="/demo"');
    expect(html).toContain('href="/demo/agenda"');
    for (const href of Object.values(DEMO_ENTRY_LINKS)) expect(html).toContain(href.replaceAll('&', '&amp;'));
    expect(html).not.toContain('Fresh instance');
  });
});
