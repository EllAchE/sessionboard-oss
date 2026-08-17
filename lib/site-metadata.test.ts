import { describe, expect, it } from 'vitest';
import {
  absoluteSiteUrl,
  createSiteMetadata,
  createSocialMetadata,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  SOCIAL_IMAGE_ALT,
} from './site-metadata';

describe('site metadata', () => {
  it('builds absolute URLs without duplicating slashes', () => {
    expect(absoluteSiteUrl('https://cicero.example/', '/demo/agenda')).toBe(
      'https://cicero.example/demo/agenda',
    );
  });

  it('keeps canonical, Open Graph, and X metadata in sync', () => {
    const metadata = createSocialMetadata({
      origin: 'https://cicero.example',
      path: '/demo/speakers',
      title: 'Speakers · Demo Conf',
      description: 'Meet the speakers at Demo Conf.',
    });

    expect(metadata.alternates?.canonical).toBe('https://cicero.example/demo/speakers');
    expect(metadata.openGraph).toMatchObject({
      type: 'website',
      url: 'https://cicero.example/demo/speakers',
      siteName: SITE_NAME,
      title: 'Speakers · Demo Conf',
      description: 'Meet the speakers at Demo Conf.',
      images: [
        {
          url: 'https://cicero.example/social/cicero-card-archetypes.png',
          width: 1200,
          height: 630,
          alt: SOCIAL_IMAGE_ALT,
          type: 'image/png',
        },
      ],
    });
    expect(metadata.twitter).toMatchObject({
      card: 'summary_large_image',
      title: 'Speakers · Demo Conf',
      description: 'Meet the speakers at Demo Conf.',
      images: [
        {
          url: 'https://cicero.example/social/cicero-card-archetypes.png',
          width: 1200,
          height: 630,
          alt: SOCIAL_IMAGE_ALT,
          type: 'image/png',
        },
      ],
    });
  });

  it('provides the complete homepage defaults', () => {
    const metadata = createSiteMetadata('https://cicero.example');

    expect(metadata.metadataBase?.toString()).toBe('https://cicero.example/');
    expect(metadata.title).toBe(SITE_TITLE);
    expect(metadata.description).toBe(SITE_DESCRIPTION);
    expect(metadata.applicationName).toBe(SITE_NAME);
    expect(metadata.alternates?.canonical).toBe('https://cicero.example/');
  });
});
