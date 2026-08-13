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
  formFieldSchema,
  mySubmissionSchema,
  openCallSchema,
  programReconcileBody,
  programReconcileResponse,
  publicFormSchema,
  sessionListQuery,
  sessionSchema,
  speakerListQuery,
  speakerProfileSchema,
  sponsorListQuery,
  sponsorSchema,
  speakerSchema,
  speakerTaskSchema,
  submissionListQuery,
  submissionSchema,
  taskFormBody,
  updateMySubmissionBody,
  updateSpeakerProfileBody,
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

const formParam: JsonSchema = {
  name: 'formId',
  in: 'path',
  required: true,
  description: "The open CFP form's id or slug",
  schema: { type: 'string' },
};

const submissionParam: JsonSchema = {
  name: 'submissionId',
  in: 'path',
  required: true,
  description: "One of the signed-in speaker's proposal ids",
  schema: { type: 'string' },
};

const assignmentParam: JsonSchema = {
  name: 'assignmentId',
  in: 'path',
  required: true,
  description: "One of the signed-in speaker's task assignment ids",
  schema: { type: 'string' },
};

const speakerSecurity = [{ speakerBearerAuth: [] }, { speakerCookieAuth: [] }];

function ref(name: string): JsonSchema {
  return { $ref: `#/components/schemas/${name}` };
}

function jsonContent(schema: JsonSchema): JsonSchema {
  return { 'application/json': { schema } };
}

function errors(codes: number[]): Record<string, JsonSchema> {
  const descriptions: Record<number, string> = {
    401: 'Missing or invalid credential',
    403: 'The credential does not have the required scope',
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
        'Read and search the public program of a Cicero event without credentials.',
        '',
        'Organizer integration writes use an event-scoped API key. Speaker proposal, profile, and',
        "task operations use that speaker's signed-in session as a cookie or Bearer secret. Every",
        'mutation is authenticated; public event, program, speaker, agenda, and CFP reads are not.',
        '',
        'Public reads are limited to 120 requests per caller per minute, speaker sessions to 300,',
        'and API keys to 600. A 429 response includes `Retry-After`. API keys have `read` or',
        '`write` scope; write keys include read access.',
      ].join('\n'),
      license: { name: 'MIT' },
    },
    servers: [{ url: `${origin.replace(/\/+$/, '')}/api/v1` }],
    tags: [
      { name: 'Events', description: 'Event metadata' },
      { name: 'Program', description: 'Sessions, speakers and the agenda' },
      { name: 'Sponsors', description: 'Published sponsors and exhibitors' },
      { name: 'Submissions', description: 'The call for speakers' },
      { name: 'Speaker', description: "The signed-in speaker's own work" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description:
            'A per-event API key. Read scope may inspect protected event data; write scope includes reads and may run organizer mutations. Public read endpoints do not require it.',
        },
        speakerBearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: "The signed-in speaker's opaque Cicero session token.",
        },
        speakerCookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'cicero_session',
          description: 'The HttpOnly session cookie used by the Cicero speaker portal.',
        },
      },
      schemas: {
        AcceleventsProgramSync: toJsonSchema(acceleventsProgramSyncBody),
        AcceleventsProgramSyncResult: toJsonSchema(acceleventsProgramSyncResult),
        Event: toJsonSchema(eventSchema),
        FormField: toJsonSchema(formFieldSchema),
        OpenCall: toJsonSchema(openCallSchema),
        PublicForm: toJsonSchema(publicFormSchema),
        Session: toJsonSchema(sessionSchema),
        Speaker: toJsonSchema(speakerSchema),
        Sponsor: toJsonSchema(sponsorSchema),
        SpeakerProfile: toJsonSchema(speakerProfileSchema),
        SpeakerProfileUpdate: toJsonSchema(updateSpeakerProfileBody),
        SpeakerSubmission: toJsonSchema(mySubmissionSchema),
        SpeakerSubmissionUpdate: toJsonSchema(updateMySubmissionBody),
        SpeakerTask: toJsonSchema(speakerTaskSchema),
        SpeakerTaskForm: toJsonSchema(taskFormBody),
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
            ...errors([404, 429]),
          },
        },
      },
      '/events/{slug}/sessions': {
        get: {
          tags: ['Program'],
          summary: 'List sessions',
          description:
            'Published sessions only. Full-text matching covers titles, descriptions, taxonomy, and speaker names; structured filters can be combined.',
          operationId: 'listSessions',
          parameters: [slugParam, ...toParameters(sessionListQuery, 'query')],
          responses: {
            '200': okResponse('Matching sessions', listOf('Session')),
            ...errors([404, 422, 429]),
          },
        },
      },
      '/events/{slug}/speakers': {
        get: {
          tags: ['Program'],
          summary: 'List speakers',
          description: 'Everyone on an accepted submission. Emails are not included.',
          operationId: 'listSpeakers',
          parameters: [slugParam, ...toParameters(speakerListQuery, 'query')],
          responses: {
            '200': okResponse('The speakers', listOf('Speaker')),
            ...errors([404, 429]),
          },
        },
      },
      '/events/{slug}/sponsors': {
        get: {
          tags: ['Sponsors'],
          summary: 'List sponsors and exhibitors',
          description:
            'Published rows only. Draft sponsor details and logo URLs are never returned.',
          operationId: 'listSponsors',
          parameters: [slugParam, ...toParameters(sponsorListQuery, 'query')],
          responses: {
            '200': okResponse('The published sponsors and exhibitors', listOf('Sponsor')),
            ...errors([404, 422]),
          },
        },
      },
      '/events/{slug}/forms': {
        get: {
          tags: ['Submissions'],
          summary: 'List open calls for speakers',
          description: 'Public discovery. Draft, closed, and out-of-window forms are omitted.',
          operationId: 'listOpenCalls',
          parameters: [slugParam],
          responses: {
            '200': okResponse('Open CFP forms', listOf('OpenCall')),
            ...errors([404, 429]),
          },
        },
      },
      '/events/{slug}/forms/{formId}': {
        get: {
          tags: ['Submissions'],
          summary: 'Read an open call for speakers',
          description: 'Public field, conditional-logic, and taxonomy contract for one open CFP.',
          operationId: 'getOpenCall',
          parameters: [slugParam, formParam],
          responses: {
            '200': okResponse('The open CFP form', {
              type: 'object',
              properties: { data: ref('PublicForm') },
              required: ['data'],
            }),
            ...errors([404, 429]),
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
            ...errors([404, 429]),
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
            ...errors([401, 403, 422, 429]),
          },
        },
      },
      '/events/{slug}/submissions': {
        get: {
          tags: ['Submissions'],
          summary: 'List submissions',
          description: 'Requires a read or write API key issued for this event.',
          operationId: 'listSubmissions',
          security: [{ bearerAuth: [] }],
          parameters: [slugParam, ...toParameters(submissionListQuery, 'query')],
          responses: {
            '200': okResponse('Matching submissions', listOf('Submission')),
            ...errors([401, 404, 422, 429]),
          },
        },
      },
      '/events/{slug}/forms/{formId}/submissions': {
        post: {
          tags: ['Submissions'],
          summary: 'Submit to a call for speakers',
          description:
            "Requires the signed-in speaker's session. The public web CFP remains the cold account-creation flow; this agent-facing POST never creates or acts as another email address. Every request creates a new proposal or draft, so a retry may create another record when the form permits more than one.",
          operationId: 'createSubmission',
          security: speakerSecurity,
          parameters: [slugParam, formParam],
          requestBody: {
            required: true,
            content: jsonContent(ref('NewSubmission')),
          },
          responses: {
            '201': okResponse('The submission', ref('NewSubmissionResult')),
            ...errors([401, 404, 409, 422, 429]),
          },
        },
      },
      '/events/{slug}/me/profile': {
        get: {
          tags: ['Speaker'],
          summary: 'Read my event-scoped speaker profile',
          operationId: 'getMySpeakerProfile',
          security: speakerSecurity,
          parameters: [slugParam],
          responses: {
            '200': okResponse('The signed-in speaker profile', {
              type: 'object',
              properties: { data: ref('SpeakerProfile') },
              required: ['data'],
            }),
            ...errors([401, 404, 429]),
          },
        },
        patch: {
          tags: ['Speaker'],
          summary: 'Update my event-scoped speaker profile',
          operationId: 'updateMySpeakerProfile',
          security: speakerSecurity,
          parameters: [slugParam],
          requestBody: {
            required: true,
            content: jsonContent(ref('SpeakerProfileUpdate')),
          },
          responses: {
            '200': okResponse('The updated speaker profile', {
              type: 'object',
              properties: { data: ref('SpeakerProfile') },
              required: ['data'],
            }),
            ...errors([401, 404, 422, 429]),
          },
        },
      },
      '/events/{slug}/me/submissions': {
        get: {
          tags: ['Speaker'],
          summary: 'List my proposals',
          operationId: 'listMySubmissions',
          security: speakerSecurity,
          parameters: [slugParam],
          responses: {
            '200': okResponse('The signed-in speaker proposals', listOf('SpeakerSubmission')),
            ...errors([401, 404, 429]),
          },
        },
      },
      '/events/{slug}/me/submissions/{submissionId}': {
        get: {
          tags: ['Speaker'],
          summary: 'Read one of my proposals',
          operationId: 'getMySubmission',
          security: speakerSecurity,
          parameters: [slugParam, submissionParam],
          responses: {
            '200': okResponse('The signed-in speaker proposal', {
              type: 'object',
              properties: { data: ref('SpeakerSubmission') },
              required: ['data'],
            }),
            ...errors([401, 404, 429]),
          },
        },
        put: {
          tags: ['Speaker'],
          summary: 'Replace editable content on one of my proposals',
          operationId: 'updateMySubmission',
          security: speakerSecurity,
          parameters: [slugParam, submissionParam],
          requestBody: {
            required: true,
            content: jsonContent(ref('SpeakerSubmissionUpdate')),
          },
          responses: {
            '200': okResponse('The updated proposal', {
              type: 'object',
              properties: { data: ref('SpeakerSubmission') },
              required: ['data'],
            }),
            ...errors([401, 404, 409, 422, 429]),
          },
        },
      },
      '/events/{slug}/me/submissions/{submissionId}/withdraw': {
        post: {
          tags: ['Speaker'],
          summary: 'Withdraw one of my proposals',
          operationId: 'withdrawMySubmission',
          security: speakerSecurity,
          parameters: [slugParam, submissionParam],
          responses: {
            '200': okResponse('The withdrawn proposal', {
              type: 'object',
              properties: { data: ref('SpeakerSubmission') },
              required: ['data'],
            }),
            ...errors([401, 404, 409, 429]),
          },
        },
      },
      '/events/{slug}/me/tasks': {
        get: {
          tags: ['Speaker'],
          summary: 'List my speaker tasks',
          operationId: 'listMySpeakerTasks',
          security: speakerSecurity,
          parameters: [slugParam],
          responses: {
            '200': okResponse('The signed-in speaker tasks', listOf('SpeakerTask')),
            ...errors([401, 404, 429]),
          },
        },
      },
      '/events/{slug}/me/tasks/{assignmentId}/complete': {
        post: {
          tags: ['Speaker'],
          summary: 'Complete an acknowledgement or link task',
          operationId: 'completeMySimpleTask',
          security: speakerSecurity,
          parameters: [slugParam, assignmentParam],
          responses: {
            '200': okResponse('The changed task state', { type: 'object' }),
            ...errors([401, 404, 409, 422, 429]),
          },
        },
      },
      '/events/{slug}/me/tasks/{assignmentId}/reopen': {
        post: {
          tags: ['Speaker'],
          summary: 'Reopen one of my completed tasks',
          operationId: 'reopenMyTask',
          security: speakerSecurity,
          parameters: [slugParam, assignmentParam],
          responses: {
            '200': okResponse('The changed task state', { type: 'object' }),
            ...errors([401, 404, 409, 429]),
          },
        },
      },
      '/events/{slug}/me/tasks/{assignmentId}/form': {
        put: {
          tags: ['Speaker'],
          summary: 'Save or submit one of my form tasks',
          operationId: 'saveMyTaskForm',
          security: speakerSecurity,
          parameters: [slugParam, assignmentParam],
          requestBody: { required: true, content: jsonContent(ref('SpeakerTaskForm')) },
          responses: {
            '200': okResponse('The changed task state', { type: 'object' }),
            ...errors([401, 404, 409, 422, 429]),
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
            ...errors([401, 403, 409, 422, 429]),
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
