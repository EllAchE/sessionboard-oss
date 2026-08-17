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

    expect(html).toContain('Copy setup prompt');
    expect(html).toContain('Paste it into Claude or ChatGPT');
    expect(html).toContain('Claude &amp; ChatGPT setup prompt');
    expect(html.indexOf('Copy setup prompt')).toBeLessThan(html.indexOf('Create an event'));
    expect(html).toContain(
      'https://github.com/EllAchE/sessionboard-oss/blob/main/.agents/skills/onboard-cicero/SKILL.md',
    );
  });

  it('describes the product in ordinary conference language', () => {
    const html = renderToStaticMarkup(<HomeContent demoAvailable />);

    expect(html).toContain('From call for speakers to public program');
    expect(html).toContain('Collect and review proposals');
    expect(html).toContain('Build a conflict-aware schedule');
    expect(html).toContain('Keep every speaker on track');
    expect(html).not.toMatch(
      /\b(?:forum|empire|imperial|petition|orator|fasti|magistrate|province|decree)\b/i,
    );
  });

  it('offers only working cold-start paths before the demo fixture is loaded', () => {
    const html = renderToStaticMarkup(<HomeContent demoAvailable={false} />);

    expect(html).toContain('Fresh instance');
    expect(html).toContain('Create the first event');
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
