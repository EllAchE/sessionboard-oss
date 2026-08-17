import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from '@/components/ui';
import { EmbedsShowcase } from './page';
import { buildEmbedSamples, type SampleContent } from './samples';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const SEEDED: SampleContent = {
  sessions: 12,
  speakers: 26,
  sponsors: 4,
  hasExhibitorMap: false,
};

const samples = buildEmbedSamples('demo', 'https://cicero.test', SEEDED);

function render(props: Parameters<typeof EmbedsShowcase>[0]) {
  // The copy buttons toast on click, so they need the provider the app layout wraps them in.
  return renderToStaticMarkup(
    <ToastProvider>
      <EmbedsShowcase {...props} />
    </ToastProvider>,
  );
}

/** A snippet is shown as text, so it reaches the markup escaped rather than as live tags. */
function asShownText(snippet: string) {
  return snippet
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

describe('EmbedsShowcase', () => {
  it('frames every available view against the named conference', () => {
    const html = render({ samples, eventName: 'Urbs Aeterna 2026' });

    for (const sample of samples) {
      expect(html).toContain(`src="${sample.framePath}"`);
      expect(html).toContain(`id="${sample.view}"`);
      expect(html).toContain(sample.label);
    }
    expect(html).toContain('Urbs Aeterna 2026');
  });

  it('keeps the previews out of the critical path', () => {
    const html = render({ samples, eventName: 'Urbs Aeterna 2026' });

    // Every frame is lazy, and none of them is the embed.js script the snippet recommends —
    // a showcase that mounted its own previews with JS would render blank to a crawler.
    expect(html.match(/loading="lazy"/g)).toHaveLength(samples.length);
    expect(html).not.toContain('<script');
  });

  it('shows the snippet that produced each frame, and the no-script alternative', () => {
    const html = render({ samples, eventName: 'Urbs Aeterna 2026' });
    const gallery = samples.find((sample) => sample.view === 'gallery');

    expect(html).toContain(asShownText(gallery?.scriptSnippet ?? ''));
    expect(html).toContain(asShownText(gallery?.iframeSnippet ?? ''));
    expect(html).toContain('https://cicero.test/embed.js');
  });

  it('omits the views the demo event cannot fill', () => {
    const html = render({ samples, eventName: 'Urbs Aeterna 2026' });

    expect(html).not.toContain('/embed/demo/exhibitor-map');
    expect(html).toContain('/embed/demo/sponsors');
  });

  it('links each view to its page on the attendee site, where it has one', () => {
    const html = render({ samples, eventName: 'Urbs Aeterna 2026' });

    expect(html).toContain('href="/demo/speakers"');
    expect(html).toContain('href="/demo/agenda"');
    expect(html).toContain('href="/demo"');
  });

  it('explains itself instead of showing empty frames on a fresh instance', () => {
    const html = render({ samples: [], eventName: null });

    expect(html).toContain('No published programme to sample yet.');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('/embed/demo/');
    expect(html).toContain('href="/signup"');
  });
});
