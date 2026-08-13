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
 * Runs before first paint so the stored theme is on the element the first time anything is styled.
 * Doing this in an effect instead is what produces the light-to-dark flash on every load.
 */
const THEME_SCRIPT = `try{var t=localStorage.getItem('cicero-theme');if(!t){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){}`;

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
