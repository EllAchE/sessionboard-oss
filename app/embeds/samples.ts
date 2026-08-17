import {
  EMBED_VIEWS,
  EMBED_VIEW_LABEL,
  EMBED_VIEW_SUMMARY,
  type EmbedView,
} from '../embed/model';

/**
 * The published sample embeds: one card per widget view, each pointing at the seeded demo
 * conference so a visitor sees what an attendee sees rather than a screenshot of it.
 *
 * Nothing here reads the database. The page hands in what the event actually has and gets back the
 * cards worth rendering, which keeps the availability rules — the only part with a wrong answer
 * available to it — testable without a fixture.
 */

/** What the demo event holds, reduced to the facts that decide whether a view has anything to show. */
export type SampleContent = {
  sessions: number;
  speakers: number;
  sponsors: number;
  /** An uploaded map file, not merely exhibitor rows: the two are unrelated in the schema. */
  hasExhibitorMap: boolean;
};

export type EmbedSample = {
  view: EmbedView;
  label: string;
  summary: string;
  /** Rendered in the preview frame, and the URL both snippets resolve to. */
  framePath: string;
  frameHeight: number;
  /** The same view as a full page on the attendee site, where one exists. */
  publicPath: string | null;
  /** The recommended snippet: one script tag, one div, auto-sized by `public/embed.js`. */
  scriptSnippet: string;
  /** The no-script alternative, for a CMS that strips script tags. */
  iframeSnippet: string;
};

/**
 * Gallery first: the speaker grid is the view a conference website reaches for, and it is the one
 * that reads as a real event at a glance. The rest follow the order an attendee meets them.
 * `coversEveryView` in the tests fails if a new `EMBED_VIEWS` entry never lands here.
 */
const SAMPLE_ORDER: readonly EmbedView[] = [
  'gallery',
  'agenda',
  'sessions',
  'speakers',
  'itinerary',
  'sponsors',
  'exhibitor-map',
];

/**
 * Tall enough that the widget's own content decides the scroll, not the frame. These are the
 * showcase's own presentation choice — a host page sizes itself from the `postMessage` height
 * `app/embed/layout.tsx` sends, and needs no number at all.
 */
const FRAME_HEIGHT: Record<EmbedView, number> = {
  gallery: 760,
  agenda: 780,
  sessions: 780,
  speakers: 760,
  itinerary: 760,
  sponsors: 620,
  'exhibitor-map': 660,
};

/** A view has a standalone page on the public event site, or it does not. `E-7`'s map has none. */
function publicPathFor(view: EmbedView, slug: string): string | null {
  return view === 'exhibitor-map' ? null : `/${slug}/${view}`;
}

/**
 * A card only ships when the demo event can fill it. An embed with nothing in it renders its empty
 * state rather than failing, which is right inside a real event website and wrong on the page whose
 * whole job is to show the widget working.
 */
function hasContent(view: EmbedView, content: SampleContent): boolean {
  switch (view) {
    case 'gallery':
    case 'speakers':
      return content.speakers > 0;
    case 'agenda':
    case 'sessions':
    case 'itinerary':
      return content.sessions > 0;
    case 'sponsors':
      return content.sponsors > 0;
    case 'exhibitor-map':
      return content.hasExhibitorMap;
  }
}

export function buildEmbedSamples(
  slug: string,
  origin: string,
  content: SampleContent,
): EmbedSample[] {
  const base = origin.replace(/\/+$/, '');

  return SAMPLE_ORDER.filter((view) => hasContent(view, content)).map((view) => {
    const framePath = `/embed/${slug}/${view}`;
    const frameHeight = FRAME_HEIGHT[view];
    const url = `${base}${framePath}`;

    return {
      view,
      label: EMBED_VIEW_LABEL[view],
      summary: EMBED_VIEW_SUMMARY[view],
      framePath,
      frameHeight,
      publicPath: publicPathFor(view, slug),
      /**
       * Byte for byte what the organizer embed studio hands out
       * (`app/organizer/embeds/EmbedStudio.tsx`), minus the filter parameters — a sample carries no
       * options so the URL a visitor copies is the URL they just watched render.
       */
      scriptSnippet: [
        `<div data-cicero-embed="${view}" data-event="${slug}"></div>`,
        `<script src="${base}/embed.js" async></script>`,
      ].join('\n'),
      iframeSnippet: `<iframe src="${url}" title="${EMBED_VIEW_LABEL[view]}" style="width:100%;height:${frameHeight}px;border:0" loading="lazy"></iframe>`,
    };
  });
}

/** Exported for the test that keeps `SAMPLE_ORDER` honest as `EMBED_VIEWS` grows. */
export const SAMPLE_VIEWS = SAMPLE_ORDER;
export { EMBED_VIEWS };
