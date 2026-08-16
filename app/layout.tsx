import type { Metadata, Viewport } from 'next';
import { GlobalFooter } from '@/components/GlobalFooter';
import { ToastProvider } from '@/components/ui';
import { appUrl } from '@/lib/env';
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" className={fontVariables} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <ToastProvider>
          {children}
          <GlobalFooter />
        </ToastProvider>
      </body>
    </html>
  );
}
