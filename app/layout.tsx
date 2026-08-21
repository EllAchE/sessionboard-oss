import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { GlobalFooter } from '@/components/GlobalFooter';
import { ToastProvider } from '@/components/ui';
import { appUrl, publicTestModeEnabled } from '@/lib/env';
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
          {siteChrome && publicTestModeEnabled() ? (
            <aside className="publicTestBanner" role="alert">
              <strong>Public test site.</strong> I did not purchase a domain or set up outbound email
              or SMS for this demo. It does not verify email or phone ownership, so any visitor can
              sign in with any email address. Do not add private information or use it for a real
              event.
            </aside>
          ) : null}
          {children}
          {siteChrome ? <GlobalFooter /> : null}
        </ToastProvider>
      </body>
    </html>
  );
}
