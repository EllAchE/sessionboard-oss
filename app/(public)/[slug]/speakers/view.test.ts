import { describe, expect, it } from 'vitest';
import { speakerViewFromSearch, speakerViewHref } from './view';

describe('speaker view', () => {
  it('uses the list unless the gallery is explicitly selected', () => {
    expect(speakerViewFromSearch({})).toBe('list');
    expect(speakerViewFromSearch({ view: 'list' })).toBe('list');
    expect(speakerViewFromSearch({ view: 'unknown' })).toBe('list');
    expect(speakerViewFromSearch({ view: ['list', 'gallery'] })).toBe('gallery');
  });

  it('builds list and gallery links without losing other options', () => {
    const search = { theme: 'dark', track: ['Platform', 'Design'], view: 'gallery' };
    const list = new URL(speakerViewHref('devcon', 'list', search), 'https://cicero.test');
    const gallery = new URL(speakerViewHref('devcon', 'gallery', search), 'https://cicero.test');

    expect(list.pathname).toBe('/devcon/speakers');
    expect(list.searchParams.has('view')).toBe(false);
    expect(list.searchParams.getAll('track')).toEqual(['Platform', 'Design']);
    expect(list.searchParams.get('theme')).toBe('dark');
    expect(gallery.searchParams.get('view')).toBe('gallery');
    expect(gallery.searchParams.getAll('track')).toEqual(['Platform', 'Design']);
  });
});
