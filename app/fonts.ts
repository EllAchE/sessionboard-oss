import localFont from 'next/font/local';

/**
 * Self-hosted only: the woff2 files ship in app/fonts/ and no request ever leaves for a font CDN.
 * Each family exposes its own variable; app/tokens.css layers the fallback stacks on top.
 */

export const spectral = localFont({
  src: [
    { path: './fonts/spectral-300-normal.woff2', weight: '300', style: 'normal' },
    { path: './fonts/spectral-300-italic.woff2', weight: '300', style: 'italic' },
    { path: './fonts/spectral-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/spectral-400-italic.woff2', weight: '400', style: 'italic' },
    { path: './fonts/spectral-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/spectral-500-italic.woff2', weight: '500', style: 'italic' },
    { path: './fonts/spectral-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './fonts/spectral-600-italic.woff2', weight: '600', style: 'italic' },
    { path: './fonts/spectral-700-normal.woff2', weight: '700', style: 'normal' },
    { path: './fonts/spectral-700-italic.woff2', weight: '700', style: 'italic' },
  ],
  variable: '--font-spectral',
  display: 'swap',
  preload: false,
  fallback: ['Iowan Old Style', 'Georgia', 'serif'],
  adjustFontFallback: 'Times New Roman',
});

export const archivo = localFont({
  src: [
    { path: './fonts/archivo-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/archivo-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/archivo-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './fonts/archivo-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-archivo',
  display: 'swap',
  preload: true,
  fallback: ['-apple-system', 'Segoe UI', 'sans-serif'],
  adjustFontFallback: 'Arial',
});

export const plexMono = localFont({
  src: [
    { path: './fonts/ibm-plex-mono-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/ibm-plex-mono-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/ibm-plex-mono-600-normal.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-plex-mono',
  display: 'swap',
  preload: false,
  fallback: ['ui-monospace', 'SF Mono', 'monospace'],
  adjustFontFallback: 'Arial',
});

export const fontVariables = `${spectral.variable} ${archivo.variable} ${plexMono.variable}`;
