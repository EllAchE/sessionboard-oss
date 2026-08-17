import { baseUrl, credentialOf, findEndpoint, type Endpoint } from './spec';

/**
 * Worked examples, one per tag group at minimum.
 *
 * Only the *values* here are authored. The request line a reader copies — verb, URL, and
 * `Authorization` header — is assembled from the spec by `curlFor`, so an endpoint that moves or
 * changes its credential moves the example with it. The sample payloads are checked against the
 * operation's own request and response schemas in `page.test.tsx`: unknown fields and missing
 * required fields both fail, so "trimmed" here means fewer array items, never fewer fields.
 */

export interface WorkedExample {
  /** Must match an `operationId` in the spec. */
  operationId: string;
  /** Values for the operation's `{path}` parameters. */
  pathParams: Record<string, string>;
  /** Query parameters to demonstrate; each key must be a declared query parameter. */
  query?: Record<string, string | number>;
  /** Request body, validated against the operation's request schema. */
  body?: unknown;
  /** The status code the sample response illustrates. */
  status: string;
  /** Sample response, validated against that status's schema. */
  response: unknown;
  /** What was cut to keep the sample readable. */
  note?: string;
}

const EVENT_SLUG = 'roman-forum-2026';

export const EXAMPLES: WorkedExample[] = [
  {
    operationId: 'getEvent',
    pathParams: { slug: EVENT_SLUG },
    status: '200',
    response: {
      slug: EVENT_SLUG,
      name: 'Roman Forum 2026',
      tagline: 'Two days on how programs actually get built',
      description: 'A working conference for people who **run** events, not just attend them.',
      eventType: 'Conference',
      theme: 'Foundations',
      timezone: 'America/Los_Angeles',
      startsOn: '2026-09-14',
      endsOn: '2026-09-15',
      startsAt: '2026-09-14T16:00:00.000Z',
      endsAt: '2026-09-16T01:00:00.000Z',
      websiteUrl: 'https://example.org/roman-forum-2026',
      venueName: 'Palazzo Conference Center',
      venueAddress: '1100 Market Street, San Francisco, CA 94102',
    },
  },
  {
    operationId: 'listSessions',
    pathParams: { slug: EVENT_SLUG },
    query: { track: 'Operations', limit: 2 },
    status: '200',
    response: {
      data: [
        {
          id: '8f1c5a2e-6d4b-4d0a-9c3f-1b2a7e9d5c40',
          ref: 'SESS-14',
          title: 'Rebuilding the agenda mid-conference',
          description: 'What we changed after the first day, and what it cost.',
          status: 'published',
          startsAt: '2026-09-14T17:30:00.000Z',
          endsAt: '2026-09-14T18:15:00.000Z',
          room: 'Basilica Hall',
          track: 'Operations',
          format: 'Case study',
          ceuCredits: null,
          speakers: [
            {
              id: '2d9b7c14-3f8a-4c62-b0d1-5e6f70a81b93',
              name: 'Livia Fontana',
              jobTitle: 'Head of Programming',
              company: 'Meridian Events',
              isPrimary: true,
            },
          ],
        },
      ],
      total: 2,
    },
    note: 'One of the two matching sessions is shown; the second has the same shape.',
  },
  {
    operationId: 'listSponsors',
    pathParams: { slug: EVENT_SLUG },
    query: { kind: 'sponsor', limit: 1 },
    status: '200',
    response: {
      data: [
        {
          id: 'c0a1f6d8-9b23-4e75-8a10-df3c4b5e6a71',
          kind: 'sponsor',
          status: 'published',
          name: 'Tessera Cloud',
          tier: 'Gold',
          websiteUrl: 'https://example.com/tessera',
          description: 'Infrastructure for event platforms.',
          boothLocation: 'B-14',
          logoUrl: 'https://cdn.example.com/tessera/logo.svg',
        },
      ],
      total: 6,
    },
    note: 'One of six published rows. Draft sponsors are never returned.',
  },
  {
    operationId: 'createSubmission',
    pathParams: { slug: EVENT_SLUG, formId: 'main-cfp' },
    body: {
      mode: 'submit',
      name: 'Livia Fontana',
      answers: {
        title: 'Rebuilding the agenda mid-conference',
        description: 'What we changed after the first day, and what it cost.',
        format: 'Case study',
        track: 'Operations',
        level: 'Intermediate',
        tags: ['agenda', 'operations'],
      },
      participants: [
        {
          firstName: 'Livia',
          lastName: 'Fontana',
          email: 'livia@example.org',
          role: 'speaker',
        },
      ],
    },
    status: '201',
    response: {
      id: '4b6e1f70-2c88-4a3d-9e51-77c0d9a2b3e4',
      ref: 'SUB-108',
      status: 'submitted',
      title: 'Rebuilding the agenda mid-conference',
    },
  },
  {
    operationId: 'listMySubmissions',
    pathParams: { slug: EVENT_SLUG },
    status: '200',
    response: {
      data: [
        {
          id: '4b6e1f70-2c88-4a3d-9e51-77c0d9a2b3e4',
          ref: 'SUB-108',
          title: 'Rebuilding the agenda mid-conference',
          descriptionMarkdown: 'What we changed after the first day, and what it cost.',
          status: 'accepted',
          level: 'Intermediate',
          format: 'Case study',
          track: 'Operations',
          formId: 'd7c2b9a4-5e18-4f36-90ab-6c1d2e3f4a5b',
          formSlug: 'main-cfp',
          formName: 'Call for speakers',
          editable: false,
          role: 'speaker',
          isPrimary: true,
          answers: {
            title: 'Rebuilding the agenda mid-conference',
            tags: ['agenda', 'operations'],
          },
          submittedAt: '2026-05-02T19:04:11.000Z',
          scheduled: {
            ref: 'SESS-14',
            title: 'Rebuilding the agenda mid-conference',
            startsAt: '2026-09-14T17:30:00.000Z',
            endsAt: '2026-09-14T18:15:00.000Z',
            room: 'Basilica Hall',
            published: true,
          },
        },
      ],
      total: 1,
    },
    note: 'Answers are keyed by form field key; only two are shown.',
  },
];

export function exampleFor(operationId: string): WorkedExample | undefined {
  return EXAMPLES.find((example) => example.operationId === operationId);
}

/** The environment variable a reader should export before running the example. */
export function credentialEnvVar(endpoint: Endpoint): string | undefined {
  const { kind } = credentialOf(endpoint.operation);
  if (kind === 'key') return 'CICERO_API_KEY';
  if (kind === 'speaker') return 'CICERO_SPEAKER_TOKEN';
  return undefined;
}

export function urlFor(example: WorkedExample, endpoint: Endpoint): string {
  const path = endpoint.path.replace(/\{([^}]+)\}/g, (match, name: string) => {
    const value = example.pathParams[name];
    return value === undefined ? match : encodeURIComponent(value);
  });

  const query = Object.entries(example.query ?? {});
  const search = query.length
    ? `?${query.map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`).join('&')}`
    : '';

  return `${baseUrl}${path}${search}`;
}

/**
 * The copyable request. Verb, URL, and credential all come from the spec, so this line cannot
 * describe a call the API does not accept.
 */
export function curlFor(example: WorkedExample): string | undefined {
  const endpoint = findEndpoint(example.operationId);
  if (!endpoint) return undefined;

  const lines = [`curl "${urlFor(example, endpoint)}"`];
  if (endpoint.method !== 'GET') lines.push(`-X ${endpoint.method}`);

  const envVar = credentialEnvVar(endpoint);
  if (envVar) lines.push(`-H "Authorization: Bearer $${envVar}"`);

  if (example.body !== undefined) {
    lines.push('-H "Content-Type: application/json"');
    lines.push(`-d '${JSON.stringify(example.body, null, 2)}'`);
  }

  return lines.join(' \\\n  ');
}
