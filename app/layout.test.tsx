import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SITE_CHROME_HEADER } from '@/lib/site-chrome';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const requestHeaders = new Headers();

vi.mock('next/headers', () => ({ headers: async () => requestHeaders }));

// next/font/local reads woff2 files through Next's compiler, which vitest is not running.
vi.mock('./fonts', () => ({ fontVariables: 'font-vars' }));

// The real footer reads the database to decide whether the demo links are live. What matters here
// is only whether the layout renders it at all.
vi.mock('@/components/GlobalFooter', () => ({
  GlobalFooter: () => <footer data-testid="global-footer">Cicero footer</footer>,
}));

const { default: RootLayout } = await import('./layout');

async function render(pathnameIsEmbed: boolean) {
  requestHeaders.delete(SITE_CHROME_HEADER);
  if (!pathnameIsEmbed) requestHeaders.set(SITE_CHROME_HEADER, '1');

  return renderToStaticMarkup(await RootLayout({ children: <main>page body</main> }));
}

describe('root layout chrome', () => {
  it('renders the global footer on a Cicero page', async () => {
    const html = await render(false);

    expect(html).toContain('page body');
    expect(html).toContain('Cicero footer');
  });

  it('leaves the footer out of an embedded widget', async () => {
    const html = await render(true);

    expect(html).toContain('page body');
    expect(html).not.toContain('Cicero footer');
    expect(html).not.toContain('<footer');
  });
});
