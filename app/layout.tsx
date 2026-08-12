import type { Metadata } from 'next';
import { fontVariables } from './fonts';
import './tokens.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cicero',
  description: 'Open-source speaker and content management for conferences.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
