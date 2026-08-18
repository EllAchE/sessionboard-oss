import { describe, expect, it } from 'vitest';
import { profileLinks } from './participants';

/*
  `SPK-S1`. The organizer record and the speaker's own portal are two views of one set of links.
  They used to disagree: the organizer saw exactly the link labelled "Website" and nothing else.
*/

const WEBSITE = { label: 'Website', url: 'https://ada.example.com' };
const LINKEDIN = { label: 'LinkedIn', url: 'https://linkedin.com/in/ada' };
const TWITTER = { label: 'Twitter', url: 'https://twitter.com/ada' };

describe('profileLinks', () => {
  it('keeps what a caller that sent no links at all had stored', () => {
    expect(profileLinks([WEBSITE, LINKEDIN], {})).toEqual([WEBSITE, LINKEDIN]);
  });

  it('replaces the set when the caller sent one', () => {
    expect(profileLinks([WEBSITE], { links: [LINKEDIN, TWITTER] })).toEqual([LINKEDIN, TWITTER]);
  });

  /* The organizer screen can now remove a link, which is the other half of being able to see it. */
  it('lets a caller that sent an empty set clear every link', () => {
    expect(profileLinks([WEBSITE, LINKEDIN], { links: [] })).toEqual([]);
  });

  /* A CSV row names one link. The speaker's own links are not that row's business. */
  it('leaves the rest alone when only a website was supplied', () => {
    expect(profileLinks([LINKEDIN, TWITTER], { website: WEBSITE.url })).toEqual([
      WEBSITE,
      LINKEDIN,
      TWITTER,
    ]);
  });

  it('replaces a stored website rather than adding a second one', () => {
    const moved = { label: 'website', url: 'https://old.example.com' };
    expect(profileLinks([moved, LINKEDIN], { website: WEBSITE.url })).toEqual([WEBSITE, LINKEDIN]);
  });

  it('folds a supplied website into a supplied set', () => {
    expect(profileLinks([], { links: [LINKEDIN], website: WEBSITE.url })).toEqual([
      WEBSITE,
      LINKEDIN,
    ]);
  });

  /* An import with a blank Website column is silent about the field, not clearing it. */
  it('treats a blank website as no opinion', () => {
    expect(profileLinks([WEBSITE, LINKEDIN], { website: '   ' })).toEqual([WEBSITE, LINKEDIN]);
  });

  it('caps the set at eight', () => {
    const many = Array.from({ length: 9 }, (_, index) => ({
      label: `Link ${index}`,
      url: `https://example.com/${index}`,
    }));
    expect(profileLinks([], { links: many, website: WEBSITE.url })).toHaveLength(8);
  });
});
