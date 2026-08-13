import type { MetadataRoute } from 'next';
import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/site-metadata';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: '/',
    display: 'standalone',
    background_color: '#F4EFE5',
    theme_color: '#B7391F',
    icons: [
      {
        src: '/icons/cicero-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/cicero-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
