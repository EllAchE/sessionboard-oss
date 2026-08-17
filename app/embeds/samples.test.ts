import { describe, expect, it } from 'vitest';
import { EMBED_VIEWS } from '../embed/model';
import { buildEmbedSamples, SAMPLE_VIEWS, type SampleContent } from './samples';

const FULL: SampleContent = {
  sessions: 12,
  speakers: 26,
  sponsors: 4,
  hasExhibitorMap: true,
};

describe('buildEmbedSamples', () => {
  it('covers every embed view, so a new widget cannot ship without a sample', () => {
    expect([...SAMPLE_VIEWS].sort()).toEqual([...EMBED_VIEWS].sort());

    const samples = buildEmbedSamples('demo', 'https://cicero.test', FULL);
    expect(samples.map((sample) => sample.view)).toEqual([...SAMPLE_VIEWS]);
  });

  it('drops the views the event cannot fill', () => {
    const seeded = buildEmbedSamples('demo', 'https://cicero.test', {
      ...FULL,
      hasExhibitorMap: false,
    });
    expect(seeded.map((sample) => sample.view)).not.toContain('exhibitor-map');
    expect(seeded.map((sample) => sample.view)).toContain('sponsors');

    const noSponsors = buildEmbedSamples('demo', 'https://cicero.test', {
      ...FULL,
      sponsors: 0,
    });
    expect(noSponsors.map((sample) => sample.view)).not.toContain('sponsors');

    const noProgramme = buildEmbedSamples('demo', 'https://cicero.test', {
      ...FULL,
      sessions: 0,
      speakers: 0,
    });
    expect(noProgramme.map((sample) => sample.view)).toEqual(['sponsors', 'exhibitor-map']);

    expect(
      buildEmbedSamples('demo', 'https://cicero.test', {
        sessions: 0,
        speakers: 0,
        sponsors: 0,
        hasExhibitorMap: false,
      }),
    ).toEqual([]);
  });

  it('points the preview, the page link, and both snippets at the same view', () => {
    const gallery = buildEmbedSamples('demo', 'https://cicero.test', FULL).find(
      (sample) => sample.view === 'gallery',
    );

    expect(gallery?.framePath).toBe('/embed/demo/gallery');
    expect(gallery?.publicPath).toBe('/demo/gallery');
    expect(gallery?.scriptSnippet).toBe(
      '<div data-cicero-embed="gallery" data-event="demo"></div>\n' +
        '<script src="https://cicero.test/embed.js" async></script>',
    );
    expect(gallery?.iframeSnippet).toContain('src="https://cicero.test/embed/demo/gallery"');
    expect(gallery?.iframeSnippet).toContain(`height:${gallery?.frameHeight}px`);
    expect(gallery?.iframeSnippet).toContain('loading="lazy"');
  });

  it('offers no standalone page for the view that has none', () => {
    const map = buildEmbedSamples('demo', 'https://cicero.test', FULL).find(
      (sample) => sample.view === 'exhibitor-map',
    );

    expect(map?.publicPath).toBeNull();
    expect(map?.framePath).toBe('/embed/demo/exhibitor-map');
  });

  it('does not double the slash when the configured origin carries a trailing one', () => {
    const [first] = buildEmbedSamples('demo', 'https://cicero.test/', FULL);

    expect(first.scriptSnippet).toContain('src="https://cicero.test/embed.js"');
    expect(first.iframeSnippet).toContain('src="https://cicero.test/embed/demo/gallery"');
  });

  it('follows the event slug it is given', () => {
    const [first] = buildEmbedSamples('urbs-2026', 'https://cicero.test', FULL);

    expect(first.framePath).toBe('/embed/urbs-2026/gallery');
    expect(first.publicPath).toBe('/urbs-2026/gallery');
    expect(first.scriptSnippet).toContain('data-event="urbs-2026"');
  });
});
