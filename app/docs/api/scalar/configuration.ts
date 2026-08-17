import type { AnyApiReferenceConfiguration } from '@scalar/types/api-reference';

/**
 * The spec Scalar reads is the one the API itself publishes, not a copy checked in beside this
 * page. `docs/openapi.json` is generated and gated by the Contracts job, but a build artefact can
 * still be stale relative to a running deployment; the route is generated from the same schemas the
 * handlers validate against, so a reference pointed at it cannot drift from the API it documents.
 */
export const SPEC_URL = '/api/v1/openapi.json';

/**
 * Deliberately close to the configuration String runs, so that comparing this page against the
 * hand-built reference at `/docs/api` compares the two approaches rather than two sets of Scalar
 * options.
 *
 * The flags worth knowing:
 * - `showDeveloperTools: 'never'` and `agent.disabled` keep Scalar's own product surfaces out of a
 *   page that is meant to document Cicero.
 * - `hideClientButton` / `hiddenClients` drop the language-picker chrome; the samples still render.
 * - `defaultOpenAllTags` matters for an API this small — nine operations do not need to start
 *   collapsed behind their tags.
 */
export const SCALAR_CONFIGURATION = {
  url: SPEC_URL,
  theme: 'kepler',
  hideModels: false,
  hideDownloadButton: false,
  showSidebar: true,
  showDeveloperTools: 'never',
  hideClientButton: true,
  hiddenClients: true,
  defaultOpenAllTags: true,
  authentication: {
    preferredSecurityScheme: 'bearerAuth',
  },
  documentDownloadType: 'none',
  agent: {
    disabled: true,
  },
} satisfies AnyApiReferenceConfiguration;
