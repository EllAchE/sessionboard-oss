import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { CommsSimulator } from '@/components/comms/CommsSimulator';
import { GlobalFooter } from '@/components/GlobalFooter';
import { ToastProvider } from '@/components/ui';
import { appUrl } from '@/lib/env';
import { hasSiteChrome } from '@/lib/site-chrome';
import { createSiteMetadata } from '@/lib/site-metadata';
import { fontVariables } from './fonts';
import './tokens.css';
import './globals.css';

export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4EFE5' },
    { media: '(prefers-color-scheme: dark)', color: '#292621' },
  ],
};

export function generateMetadata(): Metadata {
  return createSiteMetadata(appUrl());
}

/**
 * Runs before first paint so a stored theme is on the element the first time anything is styled.
 * Light is deliberately the default because it is the preferred way to experience Cicero, not
 * because of a technical constraint; we can revert to following the system preference if needed.
 * Returning visitors keep their explicit choice without a flash on load.
 */
const THEME_SCRIPT = `try{var t=localStorage.getItem('cicero-theme');if(t){document.documentElement.dataset.theme=t}}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  /**
   * `/embed/*` renders inside somebody else's page, so it gets the document and none of the
   * furniture — a widget has no business carrying Cicero's demo sign-in links into a stranger's
   * DOM. `middleware.ts` is what makes this knowable here; `lib/site-chrome.ts` explains why.
   *
   * Reading the request costs nothing that was not already spent: this layout is `force-dynamic`
   * above, so there is no static rendering left to opt out of.
   */
  const siteChrome = hasSiteChrome(await headers());

  return (
    <html lang="en" data-theme="light" className={fontVariables} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <ToastProvider>
          {children}
          {siteChrome ? <GlobalFooter /> : null}
          {/*
            Inside the provider, so a simulated delivery queues in the same stack as every other
            toast instead of fighting it for the same corner. Behind the same `siteChrome` gate as
            the footer: an embedded widget must not narrate our outbox into a stranger's page. It
            asks the server whether there is anything to watch and goes quiet when there is not, so
            mounting it on public pages costs one request.
          */}
          {siteChrome ? <CommsSimulator /> : null}
        </ToastProvider>
      </body>
    </html>
  );
}
