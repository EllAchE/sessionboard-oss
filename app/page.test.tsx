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

    expect(html).toContain('AI-guided setup');
    expect(html).toContain('Copy AI setup prompt');
    expect(html).toContain('Let Claude or ChatGPT walk through setup with you');
    expect(html).toContain('Claude &amp; ChatGPT setup prompt');
    expect(html.indexOf('Copy AI setup prompt')).toBeLessThan(html.indexOf('Create an event'));
    expect(html).toContain(
      'https://github.com/EllAchE/sessionboard-oss/blob/main/.agents/skills/onboard-cicero/SKILL.md',
    );
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

  it('makes products, agent setup, and API docs discoverable from the primary navigation', () => {
    const html = renderToStaticMarkup(<HomeContent demoAvailable={false} />);

    expect(html).toContain('href="#products"');
    expect(html).toContain('Products');
    expect(html).toContain('Agent setup');
    expect(html).not.toContain('Agent quick start');
    expect(html).toContain('href="/api/v1/openapi.json"');
    expect(html).toContain('API docs');
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
