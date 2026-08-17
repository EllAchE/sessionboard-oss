import { describe, expect, it } from 'vitest';
import { SITE_CHROME_HEADER, hasSiteChrome, isEmbedPath, withSiteChromeHeader } from './site-chrome';

describe('site chrome routing', () => {
  it('treats the widget routes, and only those, as embeds', () => {
    expect(isEmbedPath('/embed')).toBe(true);
    expect(isEmbedPath('/embed/demo/gallery')).toBe(true);

    expect(isEmbedPath('/')).toBe(false);
    expect(isEmbedPath('/demo/speakers')).toBe(false);
    expect(isEmbedPath('/organizer/embeds')).toBe(false);
  });

  it('does not mistake the public embed showcase for a widget', () => {
    // `/embeds` is a Cicero page that happens to share a prefix, and it needs its footer.
    expect(isEmbedPath('/embeds')).toBe(false);
  });

  it('marks a page request and leaves an embed request unmarked', () => {
    expect(hasSiteChrome(withSiteChromeHeader('/', new Headers()))).toBe(true);
    expect(hasSiteChrome(withSiteChromeHeader('/embed/demo/agenda', new Headers()))).toBe(false);
  });

  it('strips an inbound copy of the header so the URL is the only thing that decides', () => {
    const forged = new Headers({ [SITE_CHROME_HEADER]: '1' });

    expect(hasSiteChrome(withSiteChromeHeader('/embed/demo/agenda', forged))).toBe(false);
  });

  it('forwards the rest of the request headers untouched', () => {
    const incoming = new Headers({ cookie: 'session=abc', 'accept-language': 'en' });
    const forwarded = withSiteChromeHeader('/embed/demo/agenda', incoming);

    expect(forwarded.get('cookie')).toBe('session=abc');
    expect(forwarded.get('accept-language')).toBe('en');
    // The caller's headers are immutable in production; do not rely on being handed a fresh copy.
    expect(incoming.get(SITE_CHROME_HEADER)).toBeNull();
  });
});
