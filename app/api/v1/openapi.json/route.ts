import { appUrl } from '@/lib/env';
import { toJsonSchema, toParameters, type JsonSchema } from '../_lib/openapi';
import { PUBLIC_CACHE, handle, json } from '../_lib/respond';
import {
  agendaSchema,
  createSubmissionBody,
  createSubmissionResponse,
  errorResponse,
  eventSchema,
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
  description: "The assembly's URL slug",
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
    401: 'Missing or invalid aqueduct seal',
    404: 'No such assembly, scroll, or record',
    409: 'Conflicts with a record already on the rolls',
    422: 'The petition failed validation',
    429: 'Too many petitions at once',
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
      title: 'Cicero Public Aqueduct',
      version: '1.0.0',
      description: [
        'Read the public programme of a Cicero assembly and answer an open proclamation for orators.',
        '',
        'Public reads need no seal. `GET /events/{slug}/submissions` requires an aqueduct key',
        'issued for that assembly under Curia → Alliances, sent as `Authorization: Bearer <key>`.',
        'Keys are hashed at rest and revealed only once, when forged.',
      ].join('\n'),
      license: { name: 'MIT' },
    },
    servers: [{ url: `${origin.replace(/\/+$/, '')}/api/v1` }],
    tags: [
      { name: 'Assemblies', description: 'Founding charters and public records' },
      { name: 'Programme', description: 'Orations, orators, and the fasti' },
      { name: 'Petitions', description: 'The proclamation for orators' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'An aqueduct key for one assembly. Public reads do not require it.',
        },
      },
      schemas: {
        Event: toJsonSchema(eventSchema),
        Session: toJsonSchema(sessionSchema),
        Speaker: toJsonSchema(speakerSchema),
        Agenda: toJsonSchema(agendaSchema),
        Submission: toJsonSchema(submissionSchema),
        NewSubmission: toJsonSchema(createSubmissionBody),
        NewSubmissionResult: toJsonSchema(createSubmissionResponse),
        Error: toJsonSchema(errorResponse),
      },
    },
    paths: {
      '/events/{slug}': {
        get: {
          tags: ['Assemblies'],
          summary: 'Read one assembly charter',
          operationId: 'getEvent',
          parameters: [slugParam],
          responses: {
            '200': okResponse('The assembly', ref('Event')),
            ...errors([404]),
          },
        },
      },
      '/events/{slug}/sessions': {
        get: {
          tags: ['Programme'],
          summary: 'List proclaimed orations',
          description: 'Proclaimed orations only. Filters accept a theme or chamber name, or its id.',
          operationId: 'listSessions',
          parameters: [slugParam, ...toParameters(sessionListQuery, 'query')],
          responses: {
            '200': okResponse('Matching orations', listOf('Session')),
            ...errors([404, 422]),
          },
        },
      },
      '/events/{slug}/speakers': {
        get: {
          tags: ['Programme'],
          summary: 'List orators',
          description: 'Every orator named on an accepted petition. Dispatch addresses are withheld.',
          operationId: 'listSpeakers',
          parameters: [slugParam],
          responses: {
            '200': okResponse('The orators', listOf('Speaker')),
            ...errors([404]),
          },
        },
      },
      '/events/{slug}/agenda': {
        get: {
          tags: ['Programme'],
          summary: 'Read the fasti',
          description: "The proclaimed fasti grouped by day in the event's timezone.",
          operationId: 'getAgenda',
          parameters: [slugParam],
          responses: {
            '200': okResponse('The fasti', ref('Agenda')),
            ...errors([404]),
          },
        },
      },
      '/events/{slug}/submissions': {
        get: {
          tags: ['Petitions'],
          summary: 'List petitions',
          description: 'Requires an aqueduct key issued for this assembly.',
          operationId: 'listSubmissions',
          security: [{ bearerAuth: [] }],
          parameters: [slugParam, ...toParameters(submissionListQuery, 'query')],
          responses: {
            '200': okResponse('Matching petitions', listOf('Submission')),
            ...errors([401, 404, 422]),
          },
        },
      },
      '/events/{slug}/forms/{formId}/submissions': {
        post: {
          tags: ['Petitions'],
          summary: 'Answer a proclamation for orators',
          description:
            'No aqueduct key is required—an open proclamation accepts petitions from anyone. Cicero adds an unknown address to the rolls and sends a sealed entry link.',
          operationId: 'createSubmission',
          parameters: [
            slugParam,
            {
              name: 'formId',
              in: 'path',
              required: true,
              description: "The scroll's id or slug",
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: jsonContent(ref('NewSubmission')),
          },
          responses: {
            '201': okResponse('The petition', ref('NewSubmissionResult')),
            ...errors([404, 409, 422]),
          },
        },
      },
      '/openapi.json': {
        get: {
          tags: ['Assemblies'],
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
