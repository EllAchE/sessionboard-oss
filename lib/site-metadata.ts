import type { Metadata } from 'next';

export const SITE_NAME = 'Cicero';
export const SITE_TITLE = 'Cicero · Conference operations for organizers and speakers';
export const SITE_DESCRIPTION =
  'Run submissions, review, scheduling, speaker tasks, and publishing in one place.';
export const SOCIAL_IMAGE_ALT =
  'Cicero connects the organizer workspace and speaker portal in one conference workflow.';
export const SOCIAL_IMAGE_PATH = '/social/cicero-card-archetypes.png';

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

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function renderStaticSocialMetadata({
  origin,
  path,
  title,
  description,
}: SocialMetadataInput): string {
  const canonical = escapeHtmlAttribute(absoluteSiteUrl(origin, path));
  const socialImage = escapeHtmlAttribute(absoluteSiteUrl(origin, SOCIAL_IMAGE_PATH));
  const escapedTitle = escapeHtmlAttribute(title);
  const escapedDescription = escapeHtmlAttribute(description);
  const escapedImageAlt = escapeHtmlAttribute(SOCIAL_IMAGE_ALT);

  return `<link rel="canonical" href="${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:title" content="${escapedTitle}">
  <meta property="og:description" content="${escapedDescription}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${socialImage}">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escapedImageAlt}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapedTitle}">
  <meta name="twitter:description" content="${escapedDescription}">
  <meta name="twitter:image" content="${socialImage}">
  <meta name="twitter:image:alt" content="${escapedImageAlt}">`;
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
