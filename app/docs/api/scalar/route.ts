import { renderApiReference } from '@scalar/client-side-rendering';

import { PAGE_TITLE, SCALAR_CONFIGURATION } from './configuration';

/**
 * `@scalar/api-reference-react` wraps Scalar's Vue app in a React shim and ships it inside Cicero's
 * own client bundle — Scalar's docs call that wrapper untested for SSR/SSG, which is why the old
 * version of this route forced `ssr: false` and paid for a client-only render on every visit.
 *
 * A route handler sidesteps that: it returns a complete, static HTML document that loads Scalar's
 * own standalone bundle from a CDN and boots itself, the same shape Scalar's own Next.js
 * integration produces. Nothing here goes through the app's React tree, so `app/layout.tsx` never
 * renders for this path — the back-link below is spliced into Scalar's markup directly because
 * there is no layout left to hold it.
 */
export function GET() {
  const html = renderApiReference({
    config: SCALAR_CONFIGURATION,
    pageTitle: PAGE_TITLE,
  });

  const withBackLink = html.replace(
    '<div id="app"></div>',
    `<a href="/docs/api" style="position:fixed;top:12px;left:12px;z-index:1000;font:14px system-ui,sans-serif;color:#8e8e8e;text-decoration:none;background:rgba(0,0,0,0.55);padding:6px 12px;border-radius:6px;">&larr; Back to the Cicero-styled reference</a>
    <div id="app"></div>`,
  );

  return new Response(withBackLink, {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
}
