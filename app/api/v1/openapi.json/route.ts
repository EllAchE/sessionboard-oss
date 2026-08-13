import { appUrl } from '@/lib/env';
import { toJsonSchema, toParameters, type JsonSchema } from '../_lib/openapi';
import { PUBLIC_CACHE, handle, json } from '../_lib/respond';
import {
  acceleventsProgramSyncBody,
  acceleventsProgramSyncResult,
  agendaSchema,
  createSubmissionBody,
  createSubmissionResponse,
  errorResponse,
  eventSchema,
  programReconcileBody,
  programReconcileResponse,
  sessionListQuery,
  sessionSchema,
  speakerSchema,
  submissionListQuery,
  submissionSchema,
} from '../_lib/schemas';

export const dynamic = 'force-dynamic';

/**
 * `Z-5`. Generated from the same Zod schemas the handlers validate with, so the spec is a
 * projection of the implementation rather than a document about it.
 */

const slugParam: JsonSchema = {
  name: 'slug',
  in: 'path',
  required: true,
  description: "The event's URL slug",
  schema: { type: 'string' },
};

function ref(name: string): JsonSchema {
  return { $ref: `#/components/schemas/${name}` };
}

function jsonContent(schema: JsonSchema): JsonSchema {
  return { 'application/json': { schema } };
}

function errors(codes: number[]): Record<string, JsonSchema> {
  const descriptions: Record<number, string> = {
    401: 'Missing or invalid API key',
    404: 'No such event, form or resource',
    409: 'Conflicts with an existing record',
    422: 'The request failed validation',
    429: 'Rate limited',
  };

  return Object.fromEntries(
    codes.map((code) => [
      String(code),
      {
        description: descriptions[code] ?? 'Error',
        content: jsonContent(ref('Error')),
      },
    ]),
  );
}

function okResponse(description: string, schema: JsonSchema): JsonSchema {
  return { description, content: jsonContent(schema) };
}

export function buildSpec(origin = appUrl()): JsonSchema {
  const listOf = (name: string): JsonSchema => ({
    type: 'object',
    properties: {
      data: { type: 'array', items: ref(name) },
      total: { type: 'integer' },
    },
    required: ['data', 'total'],
  });

  return {
    openapi: '3.1.0',
    info: {
      title: 'Cicero API',
      version: '1.0.0',
      description: [
        'Read the public program of a Cicero event, and submit to an open call for speakers.',
        '',
        'Public reads need no credential. `GET /events/{slug}/submissions` is scoped to an API key',
        'issued for that event under Admin → Integrations, sent as `Authorization: Bearer <key>`.',
        'Keys are hashed at rest and shown once, at creation.',
        'Program reconciliation writes use the same event-scoped Bearer keys and preview by default.',
      ].join('\n'),
      license: { name: 'MIT' },
    },
    servers: [{ url: `${origin.replace(/\/+$/, '')}/api/v1` }],
    tags: [
      { name: 'Events', description: 'Event metadata' },
      { name: 'Program', description: 'Sessions, speakers and the agenda' },
      { name: 'Submissions', description: 'The call for speakers' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'A per-event API key. Public read endpoints do not require it.',
        },
      },
      schemas: {
        AcceleventsProgramSync: toJsonSchema(acceleventsProgramSyncBody),
        AcceleventsProgramSyncResult: toJsonSchema(acceleventsProgramSyncResult),
        Event: toJsonSchema(eventSchema),
        Session: toJsonSchema(sessionSchema),
        Speaker: toJsonSchema(speakerSchema),
        Agenda: toJsonSchema(agendaSchema),
        Submission: toJsonSchema(submissionSchema),
        NewSubmission: toJsonSchema(createSubmissionBody),
        NewSubmissionResult: toJsonSchema(createSubmissionResponse),
        ProgramReconcileRequest: toJsonSchema(programReconcileBody),
        ProgramReconcileResult: toJsonSchema(programReconcileResponse),
        Error: toJsonSchema(errorResponse),
      },
    },
    paths: {
      '/events/{slug}': {
        get: {
          tags: ['Events'],
          summary: 'Fetch one event',
          operationId: 'getEvent',
          parameters: [slugParam],
          responses: {
            '200': okResponse('The event', ref('Event')),
            ...errors([404]),
          },
        },
      },
      '/events/{slug}/sessions': {
        get: {
          tags: ['Program'],
          summary: 'List sessions',
          description: 'Published sessions only. Filters accept a track or room name, or its id.',
          operationId: 'listSessions',
          parameters: [slugParam, ...toParameters(sessionListQuery, 'query')],
          responses: {
            '200': okResponse('Matching sessions', listOf('Session')),
            ...errors([404, 422]),
          },
        },
      },
      '/events/{slug}/speakers': {
        get: {
          tags: ['Program'],
          summary: 'List speakers',
          description: 'Everyone on an accepted submission. Emails are not included.',
          operationId: 'listSpeakers',
          parameters: [slugParam],
          responses: {
            '200': okResponse('The speakers', listOf('Speaker')),
            ...errors([404]),
          },
        },
      },
      '/events/{slug}/agenda': {
        get: {
          tags: ['Program'],
          summary: 'Fetch the agenda',
          description: "Published sessions grouped by day in the event's timezone.",
          operationId: 'getAgenda',
          parameters: [slugParam],
          responses: {
            '200': okResponse('The agenda', ref('Agenda')),
            ...errors([404]),
          },
        },
      },
      '/events/{slug}/program/reconcile': {
        post: {
          tags: ['Program'],
          summary: 'Preview or apply an Accelevents program collection',
          description:
            'Requires an API key issued for this event. `apply: false` is a side-effect-free preview. `merge` upserts listed sessions and honors explicit `deleteExternalIds`. `replace` also reports source-managed sessions missing from the collection; applying those deletes requires `confirmDeleteMissing: "DELETE_MISSING_SESSIONS"`. Any per-record error prevents the entire request from being applied.',
          operationId: 'reconcileProgram',
          security: [{ bearerAuth: [] }],
          parameters: [slugParam],
          requestBody: {
            required: true,
            content: jsonContent(ref('ProgramReconcileRequest')),
          },
          responses: {
            '200': okResponse('The preview or apply report', {
              type: 'object',
              properties: { data: ref('ProgramReconcileResult') },
              required: ['data'],
            }),
            ...errors([401, 422]),
          },
        },
      },
      '/events/{slug}/submissions': {
        get: {
          tags: ['Submissions'],
          summary: 'List submissions',
          description: 'Requires an API key issued for this event.',
          operationId: 'listSubmissions',
          security: [{ bearerAuth: [] }],
          parameters: [slugParam, ...toParameters(submissionListQuery, 'query')],
          responses: {
            '200': okResponse('Matching submissions', listOf('Submission')),
            ...errors([401, 404, 422]),
          },
        },
      },
      '/events/{slug}/forms/{formId}/submissions': {
        post: {
          tags: ['Submissions'],
          summary: 'Submit to a call for speakers',
          description:
            'No API key required — an open CFP takes submissions from anyone. An account is created for the email address if none exists, and a sign-in link is emailed. This POST is non-idempotent: a retry may create another submission when the form allows multiple submissions per person.',
          operationId: 'createSubmission',
          parameters: [
            slugParam,
            {
              name: 'formId',
              in: 'path',
              required: true,
              description: "The form's id or slug",
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: jsonContent(ref('NewSubmission')),
          },
          responses: {
            '201': okResponse('The submission', ref('NewSubmissionResult')),
            ...errors([404, 409, 422]),
          },
        },
      },
      '/events/{slug}/integrations/accelevents/program': {
        post: {
          tags: ['Program'],
          summary: 'Preview or apply the fixture Accelevents program sync',
          description:
            'Bonus fixture capability for deterministic demos. It reconciles the published event, sessions and accepted speakers with create, update, delete and no-op results. Live Accelevents remains limited to the documented accepted-speaker push.',
          operationId: 'syncAcceleventsProgramFixture',
          security: [{ bearerAuth: [] }],
          parameters: [slugParam],
          requestBody: {
            required: true,
            content: jsonContent(ref('AcceleventsProgramSync')),
          },
          responses: {
            '200': okResponse(
              'The reconciliation plan or applied result',
              ref('AcceleventsProgramSyncResult'),
            ),
            ...errors([401, 409, 422]),
          },
        },
      },
      '/openapi.json': {
        get: {
          tags: ['Events'],
          summary: 'This document',
          operationId: 'getOpenApi',
          responses: {
            '200': okResponse('The OpenAPI description', { type: 'object' }),
          },
        },
      },
    },
  };
}

export async function GET() {
  return handle(async () => json(buildSpec(), { headers: PUBLIC_CACHE }));
}
