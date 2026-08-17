import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parseEmbedOptions, type PublicBundle, type PublicSpeaker } from '../model';
import { GalleryWidget } from './GalleryWidget';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function speaker(index: number): PublicSpeaker {
  return {
    id: `speaker-${index}`,
    slug: `speaker-${index}`,
    name: `Speaker ${index}`,
    pronouns: null,
    jobTitle: 'Principal engineer',
    company: 'Aqua Marcia',
    bioHtml: '',
    bioText: '',
    bioExcerpt: '',
    headshotUrl: null,
    links: [],
    sessionIds: [],
  };
}

const bundle: PublicBundle = {
  event: {
    id: 'event-1',
    slug: 'scaling-qa',
    name: 'Scaling QA',
    tagline: null,
    timezone: 'UTC',
    startsOn: '2027-04-15',
    endsOn: '2027-04-15',
    websiteUrl: null,
    venueName: null,
  },
  sessions: [],
  speakers: [speaker(1), speaker(2)],
  tracks: [],
  rooms: [],
};

describe('GalleryWidget', () => {
  it('offers the search box by default', () => {
    const html = renderToStaticMarkup(
      <GalleryWidget bundle={bundle} options={parseEmbedOptions({})} sessionBase="/sessions" />,
    );

    expect(html).toContain('Search speakers, companies, or talks');
    expect(html).toContain('2 of 2 speakers');
  });

  it('drops the search box, and its result count, when the caller passes a truncated bundle', () => {
    const html = renderToStaticMarkup(
      <GalleryWidget
        bundle={bundle}
        options={parseEmbedOptions({})}
        sessionBase="/sessions"
        showSearch={false}
      />,
    );

    expect(html).not.toContain('Search speakers, companies, or talks');
    expect(html).not.toContain('2 of 2 speakers');
    expect(html).toContain('Speaker 1');
    expect(html).toContain('Speaker 2');
  });
});
