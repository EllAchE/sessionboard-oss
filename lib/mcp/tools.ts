import { z } from 'zod';
import {
  agendaSchema,
  eventSchema,
  programReconcileBody,
  programReconcileResponse,
  sessionListQuery,
  sessionSchema,
  speakerListQuery,
  speakerSchema,
  submissionListQuery,
  submissionSchema,
} from '@/app/api/v1/_lib/schemas';
import { toJsonSchema, type JsonSchema } from '@/app/api/v1/_lib/openapi';

const emptyInput = z.object({}).strict();
const sessionListOutput = z.object({ data: z.array(sessionSchema), total: z.number().int() });
const speakerListOutput = z.object({ data: z.array(speakerSchema), total: z.number().int() });
const submissionListOutput = z.object({ data: z.array(submissionSchema), total: z.number().int() });

export const MCP_TOOL_DEFINITIONS = [
  {
    name: 'cicero_event_get',
    title: 'Get event',
    description: 'Read metadata for the event associated with this API key.',
    access: 'read',
    inputSchema: emptyInput,
    outputSchema: eventSchema,
  },
  {
    name: 'cicero_sessions_list',
    title: 'List sessions',
    description: 'Search and filter sessions for the event associated with this API key.',
    access: 'read',
    inputSchema: sessionListQuery,
    outputSchema: sessionListOutput,
  },
  {
    name: 'cicero_speakers_list',
    title: 'List speakers',
    description: 'Search speakers on accepted submissions for this event.',
    access: 'read',
    inputSchema: speakerListQuery,
    outputSchema: speakerListOutput,
  },
  {
    name: 'cicero_agenda_get',
    title: 'Get agenda',
    description: "Read the event's published agenda grouped in the event timezone.",
    access: 'read',
    inputSchema: emptyInput,
    outputSchema: agendaSchema,
  },
  {
    name: 'cicero_submissions_list',
    title: 'List submissions',
    description: 'List event submissions, including private review status and submitter details.',
    access: 'read',
    inputSchema: submissionListQuery,
    outputSchema: submissionListOutput,
  },
  {
    name: 'cicero_program_reconcile',
    title: 'Reconcile program',
    description:
      'Preview or apply an Accelevents-shaped program reconciliation. Preview with apply=false before writing.',
    access: 'write',
    inputSchema: programReconcileBody,
    outputSchema: programReconcileResponse,
  },
] as const;

export type McpToolDefinition = (typeof MCP_TOOL_DEFINITIONS)[number];
export type McpToolName = McpToolDefinition['name'];

export type McpToolManifest = {
  name: string;
  version: string;
  transport: 'streamable-http';
  authentication: {
    scheme: 'bearer';
    credential: 'event-api-key';
  };
  tools: Array<{
    name: McpToolName;
    title: string;
    description: string;
    access: 'read' | 'write';
    inputSchema: JsonSchema;
    outputSchema: JsonSchema;
  }>;
};

/** Generated from the exact Zod schemas the MCP handlers parse. */
export function buildMcpToolManifest(): McpToolManifest {
  return {
    name: 'cicero',
    version: '1.0.0',
    transport: 'streamable-http',
    authentication: { scheme: 'bearer', credential: 'event-api-key' },
    tools: MCP_TOOL_DEFINITIONS.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      access: tool.access,
      inputSchema: toJsonSchema(tool.inputSchema),
      outputSchema: toJsonSchema(tool.outputSchema),
    })),
  };
}
