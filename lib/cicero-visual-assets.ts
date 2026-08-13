export type CiceroTransparentAssetKind = 'photo cutout' | 'original illustration';

export interface CiceroTransparentAsset {
  id: string;
  name: string;
  path: string;
  kind: CiceroTransparentAssetKind;
  alt: string;
  orientation: 'landscape' | 'portrait' | 'square';
  recommendedFor: readonly string[];
  provenance: string;
}

export interface CiceroLogoAsset {
  id: string;
  name: string;
  path: string;
  recommendedFor: readonly string[];
  preview: 'light' | 'dark';
}

export const CICERO_TRANSPARENT_ASSETS = [
  {
    id: 'germanicus-bust-cutout',
    name: 'Germanicus bust cutout',
    path: '/assets/roman/cutouts/germanicus-bust.png',
    kind: 'photo cutout',
    orientation: 'portrait',
    alt: 'A backgroundless white marble portrait bust of Germanicus.',
    recommendedFor: ['orator placeholder', 'hero edge', 'editorial portrait'],
    provenance: 'AI-assisted derivative of roman asset germanicus-bust',
  },
  {
    id: 'laurel-head-cutout',
    name: 'Laurel-crowned head cutout',
    path: '/assets/roman/cutouts/laurel-head.png',
    kind: 'photo cutout',
    orientation: 'square',
    alt: 'A backgroundless weathered marble head wearing a carved laurel wreath.',
    recommendedFor: ['award state', 'editorial accent', 'profile placeholder'],
    provenance: 'AI-assisted derivative of roman asset laurel-head',
  },
  {
    id: 'toga-statue-cutout',
    name: 'Toga figure cutout',
    path: '/assets/roman/cutouts/toga-statue.png',
    kind: 'photo cutout',
    orientation: 'portrait',
    alt: 'A backgroundless headless Roman marble statue with deeply folded toga drapery.',
    recommendedFor: ['empty state', 'feature edge', 'orator journey'],
    provenance: 'AI-assisted derivative of roman asset toga-statue',
  },
  {
    id: 'corinthian-capital-cutout',
    name: 'Corinthian capital cutout',
    path: '/assets/roman/cutouts/corinthian-capital.png',
    kind: 'photo cutout',
    orientation: 'landscape',
    alt: 'A backgroundless carved Roman Corinthian capital with acanthus leaves and small figures.',
    recommendedFor: ['section footing', 'empty state', 'architectural accent'],
    provenance: 'AI-assisted derivative of roman asset corinthian-capital',
  },
  {
    id: 'speaker-rostrum',
    name: 'Orator rostrum',
    path: '/assets/roman/illustrations/speaker-rostrum.png',
    kind: 'original illustration',
    orientation: 'landscape',
    alt: 'An illustrated stone orator rostrum with rolled fasti, laurel, and a vermilion ribbon.',
    recommendedFor: ['onboarding', 'proclamation for orators', 'orator empty state'],
    provenance: 'Original OpenAI-generated Cicero illustration',
  },
  {
    id: 'review-tablets',
    name: 'Council tablets',
    path: '/assets/roman/illustrations/review-tablets.png',
    kind: 'original illustration',
    orientation: 'landscape',
    alt: 'Illustrated Roman wax tablets, a bronze stylus, and five scoring tiles.',
    recommendedFor: ['council queue', 'judgment empty state', 'decision feature'],
    provenance: 'Original OpenAI-generated Cicero illustration',
  },
  {
    id: 'agenda-theatre',
    name: 'Fasti theatre',
    path: '/assets/roman/illustrations/agenda-theatre.png',
    kind: 'original illustration',
    orientation: 'square',
    alt: 'An illustrated isometric Roman theatre arranged as a programme grid with a vermilion stage.',
    recommendedFor: ['fasti builder', 'public programme', 'fasti empty state'],
    provenance: 'Original OpenAI-generated Cicero illustration',
  },
] as const satisfies readonly CiceroTransparentAsset[];

export const CICERO_LOGO_ASSETS = [
  {
    id: 'cicero-mark',
    name: 'Cicero columns mark (default)',
    path: '/brand/cicero-mark.svg',
    preview: 'light',
    recommendedFor: ['product chrome', 'light surfaces', 'small square placements'],
  },
  {
    id: 'cicero-mark-reversed',
    name: 'Cicero columns mark, reversed',
    path: '/brand/cicero-mark-reversed.svg',
    preview: 'dark',
    recommendedFor: ['dark surfaces', 'photo overlays', 'footer marks'],
  },
  {
    id: 'cicero-lockup',
    name: 'Cicero lockup',
    path: '/brand/cicero-lockup.svg',
    preview: 'light',
    recommendedFor: ['external materials', 'wide headers', 'partner listings'],
  },
  {
    id: 'cicero-amphitheatre-mark',
    name: 'Cicero amphitheatre mark (alternate)',
    path: '/brand/cicero-amphitheatre-mark.svg',
    preview: 'light',
    recommendedFor: ['archived direction', 'light surfaces'],
  },
  {
    id: 'cicero-amphitheatre-mark-reversed',
    name: 'Cicero amphitheatre mark, reversed (alternate)',
    path: '/brand/cicero-amphitheatre-mark-reversed.svg',
    preview: 'dark',
    recommendedFor: ['archived direction', 'dark surfaces'],
  },
  {
    id: 'cicero-amphitheatre-lockup',
    name: 'Cicero amphitheatre lockup (alternate)',
    path: '/brand/cicero-amphitheatre-lockup.svg',
    preview: 'light',
    recommendedFor: ['archived direction', 'wide placements'],
  },
] as const satisfies readonly CiceroLogoAsset[];
