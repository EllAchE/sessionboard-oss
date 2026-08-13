import type { Metadata } from 'next';

export const SITE_NAME = 'Cicero';
export const SITE_TITLE = 'Cicero · Rule your conference from the Forum';
export const SITE_DESCRIPTION =
  'Convene petitions, councils, orators, fasti, and dispatches in one commanding conference Forum.';
export const SOCIAL_IMAGE_ALT =
  'Cicero’s conference Forum, illustrated with a Roman theatre and fasti tablets.';
const SOCIAL_IMAGE_PATH = '/social/cicero-card.png';

type SocialMetadataInput = {
  origin: string;
  path: string;
  title: string;
  description: string;
};

export function absoluteSiteUrl(origin: string, path: string): string {
  const base = `${origin.replace(/\/+$/, '')}/`;
  return new URL(path, base).toString();
}

export function createSocialMetadata({
  origin,
  path,
  title,
  description,
}: SocialMetadataInput): Metadata {
  const canonical = absoluteSiteUrl(origin, path);
  const socialImage = absoluteSiteUrl(origin, SOCIAL_IMAGE_PATH);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      locale: 'en_US',
      url: canonical,
      siteName: SITE_NAME,
      title,
      description,
      images: [
        {
          url: socialImage,
          width: 1200,
          height: 630,
          alt: SOCIAL_IMAGE_ALT,
          type: 'image/png',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [
        {
          url: socialImage,
          width: 1200,
          height: 630,
          alt: SOCIAL_IMAGE_ALT,
          type: 'image/png',
        },
      ],
    },
  };
}

export function createSiteMetadata(origin: string): Metadata {
  return {
    metadataBase: new URL(origin),
    applicationName: SITE_NAME,
    appleWebApp: {
      capable: true,
      title: SITE_NAME,
      statusBarStyle: 'default',
    },
    ...createSocialMetadata({
      origin,
      path: '/',
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
    }),
  };
}
