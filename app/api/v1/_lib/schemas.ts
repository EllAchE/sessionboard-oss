import { z } from 'zod';

/**
 * `Z-5`. One set of schemas, two jobs: they validate what comes in and they generate
 * `/api/v1/openapi.json`. A hand-written spec drifts from the handler the first time someone adds a
 * field; a generated one cannot.
 *
 * `.describe()` on a field is the description that reaches the spec, so it is documentation that
 * lives next to the validation rather than in a separate file that nobody updates.
 */

export const eventSchema = z
  .object({
    slug: z.string().describe('URL-safe identifier for the event'),
    name: z.string(),
    tagline: z.string().nullable(),
    description: z.string().nullable().describe('Markdown'),
    timezone: z.string().describe('IANA timezone, e.g. America/Los_Angeles'),
    startsOn: z.string().nullable().describe('ISO date'),
    endsOn: z.string().nullable().describe('ISO date'),
    websiteUrl: z.string().nullable(),
    venueName: z.string().nullable(),
    venueAddress: z.string().nullable(),
  })
  .describe('A conference or event');

export const sessionSchema = z
  .object({
    id: z.string().describe('UUID'),
    ref: z.string().describe('Human-readable reference, e.g. SESS-4'),
    title: z.string(),
    description: z.string().nullable().describe('Markdown'),
    status: z.enum(['draft', 'published', 'cancelled']),
    startsAt: z.string().nullable().describe('ISO 8601'),
    endsAt: z.string().nullable().describe('ISO 8601'),
    room: z.string().nullable(),
    track: z.string().nullable(),
    format: z.string().nullable(),
    ceuCredits: z.string().nullable(),
    speakers: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        jobTitle: z.string().nullable(),
        company: z.string().nullable(),
        isPrimary: z.boolean(),
      }),
    ),
  })
  .describe('A scheduled session on the agenda');

export const speakerSchema = z
  .object({
    id: z.string().describe('UUID'),
    name: z.string(),
    pronouns: z.string().nullable(),
    jobTitle: z.string().nullable(),
    company: z.string().nullable(),
    bio: z.string().nullable().describe('Markdown'),
    headshotUrl: z.string().nullable(),
    links: z.array(z.object({ label: z.string(), url: z.string() })),
    sessions: z.array(z.object({ id: z.string(), title: z.string() })),
  })
  .describe('A speaker with at least one accepted session');

export const agendaSchema = z
  .object({
    event: eventSchema,
    days: z.array(
      z.object({
        date: z.string().describe('ISO date in the event timezone'),
        sessions: z.array(sessionSchema),
      }),
    ),
    /** Published sessions with no time yet, so a consumer does not silently drop them. */
    unscheduled: z.array(sessionSchema),
  })
  .describe('The published agenda, grouped by day');

export const submissionSchema = z
  .object({
    id: z.string().describe('UUID'),
    ref: z.string().describe('Human-readable reference, e.g. ABS-12'),
    title: z.string(),
    description: z.string().nullable().describe('Markdown'),
    status: z.enum([
      'draft',
      'submitted',
      'under_review',
      'accepted',
      'declined',
      'waitlisted',
      'withdrawn',
    ]),
    track: z.string().nullable(),
    format: z.string().nullable(),
    level: z.string().nullable(),
    tags: z.array(z.string()),
    submitter: z.object({ name: z.string().nullable(), email: z.string() }),
    answers: z.record(z.unknown()).describe('Custom form answers, keyed by field key'),
    submittedAt: z.string().nullable().describe('ISO 8601'),
    decidedAt: z.string().nullable().describe('ISO 8601'),
  })
  .describe('A CFP submission. Requires an API key.');

export const sessionListQuery = z.object({
  status: z.enum(['draft', 'published', 'cancelled']).optional().describe('Defaults to published'),
  track: z.string().optional().describe('Track name or id'),
  room: z.string().optional().describe('Room name or id'),
});

export const submissionListQuery = z.object({
  status: z
    .enum(['draft', 'submitted', 'under_review', 'accepted', 'declined', 'waitlisted', 'withdrawn'])
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().describe('Defaults to 100'),
});

export const createSubmissionBody = z
  .object({
    email: z.string().email().describe('Submitter email; an account is created if none exists'),
    name: z.string().optional().describe('Submitter display name'),
    answers: z
      .record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]))
      .describe(
        'Keyed by the form field key. Built-in keys are title, description, format, track, level, tags.',
      ),
  })
  .describe('A submission to a published form');

export const createSubmissionResponse = z.object({
  id: z.string(),
  ref: z.string(),
  status: z.enum(['draft', 'submitted']),
  title: z.string(),
});

export const programSessionInputSchema = z.object({
  externalId: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe('Stable Accelevents session id; unique within this event'),
  title: z.string().trim().min(1).max(300),
  description: z
    .string()
    .max(50_000)
    .nullable()
    .describe('Required Markdown field; null or blank clears the description'),
  status: z.enum(['draft', 'published', 'cancelled']),
  startsAt: z.string().datetime({ offset: true }).nullable(),
  endsAt: z.string().datetime({ offset: true }).nullable(),
  room: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .nullable()
    .describe('Event room id or exact name (case-insensitive)'),
  track: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .nullable()
    .describe('Event track id or exact name (case-insensitive)'),
  format: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .nullable()
    .describe('Event format id or exact name (case-insensitive)'),
  ceuCredits: z.string().trim().max(50).nullable(),
});

export const programReconcileBody = z
  .object({
    source: z.literal('accelevents'),
    mode: z
      .enum(['merge', 'replace'])
      .default('merge')
      .describe(
        'merge upserts listed records; replace also deletes managed records that are absent',
      ),
    apply: z
      .boolean()
      .default(false)
      .describe('False previews the exact operations without writing'),
    confirmDeleteMissing: z
      .literal('DELETE_MISSING_SESSIONS')
      .optional()
      .describe('Required to apply replace mode when missing managed sessions would be deleted'),
    sessions: z.array(programSessionInputSchema).max(1_000).default([]),
    deleteExternalIds: z
      .array(z.string().trim().min(1).max(200))
      .max(1_000)
      .default([])
      .describe('Explicit source-managed sessions to delete in merge mode'),
  })
  .describe('An Accelevents-shaped program snapshot or patch');

export const programOperationSchema = z.object({
  externalId: z.string(),
  action: z.enum(['create', 'update', 'delete', 'noop', 'error']),
  sessionId: z.string().nullable(),
  changes: z.array(z.string()),
  message: z.string().nullable(),
});

export const programReconcileResponse = z.object({
  source: z.literal('accelevents'),
  mode: z.enum(['merge', 'replace']),
  applied: z.boolean(),
  canApply: z.boolean(),
  requiresDeleteConfirmation: z.boolean(),
  summary: z.object({
    create: z.number().int(),
    update: z.number().int(),
    delete: z.number().int(),
    noop: z.number().int(),
    error: z.number().int(),
  }),
  operations: z.array(programOperationSchema),
});

export const acceleventsProgramSyncBody = z
  .object({
    mode: z.enum(['preview', 'apply']).default('preview'),
    allowDeletes: z
      .boolean()
      .default(false)
      .describe('Must be true with apply mode before remote-only fixture records are deleted'),
    resetFixture: z
      .literal('drifted')
      .optional()
      .describe(
        'Fixture mode only: reset the remote collection to a repeatable drifted demo state',
      ),
  })
  .describe('Controls a one-way published-program sync to the fixture Accelevents adapter');

export const acceleventsProgramSyncResult = z.object({
  mode: z.enum(['preview', 'apply']),
  adapter: z.literal('fake'),
  eventUrl: z.string(),
  allowDeletes: z.boolean(),
  fixtureReset: z.boolean(),
  counts: z.object({
    create: z.number().int(),
    update: z.number().int(),
    delete: z.number().int(),
    noop: z.number().int(),
    blockedDeletes: z.number().int(),
  }),
  results: z.array(
    z.object({
      resourceType: z.enum(['event', 'session', 'speaker']),
      sourceId: z.string(),
      remoteId: z.string().nullable(),
      action: z.enum(['create', 'update', 'delete', 'noop']),
      status: z.enum(['planned', 'applied', 'blocked', 'unchanged']),
      message: z.string().nullable(),
    }),
  ),
});

export const errorResponse = z
  .object({
    error: z.object({
      code: z.enum([
        'unauthorized',
        'forbidden',
        'not_found',
        'invalid',
        'conflict',
        'rate_limited',
        'unavailable',
        'internal',
      ]),
      message: z.string(),
      details: z
        .record(z.string())
        .optional()
        .describe('Field-keyed messages when code is invalid'),
    }),
  })
  .describe('Every non-2xx response has this shape');

export type EventPayload = z.infer<typeof eventSchema>;
export type SessionPayload = z.infer<typeof sessionSchema>;
export type SpeakerPayload = z.infer<typeof speakerSchema>;
export type AgendaPayload = z.infer<typeof agendaSchema>;
export type SubmissionPayload = z.infer<typeof submissionSchema>;
