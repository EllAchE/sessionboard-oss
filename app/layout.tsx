import type { Metadata } from 'next';
import { ToastProvider } from '@/components/ui';
import { fontVariables } from './fonts';
import './tokens.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cicero',
  description: 'Open-source speaker and content management for conferences.',
};

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
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
