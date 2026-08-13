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
const agentMailTemplateSchema = z.object({
  key: z.string(),
  name: z.string(),
  subject: z.string(),
  bodyMarkdown: z.string(),
  enabled: z.boolean(),
  attachIcs: z.boolean(),
  source: z.enum(['event', 'default']),
  updatedAt: z.string().datetime().nullable(),
  agentSendable: z.boolean(),
  agentSendBlockedReason: z.string().nullable(),
});
const agentMailRecipientSchema = z.object({
  participantId: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
});
export const agentMailPreviewInput = z.object({
  participantId: z
    .string()
    .uuid()
    .describe('Participant id from this event; arbitrary email addresses are never accepted'),
  templateKey: z.string().trim().min(1).max(120),
});
export const agentMailSendInput = z.object({
  participantId: z.string().uuid(),
  recipientEmail: z
    .string()
    .email()
    .describe('Exact event-participant address returned by preview; arbitrary addresses are rejected'),
  templateKey: z.string().trim().min(1).max(120),
  subject: z.string().max(500),
  bodyMarkdown: z.string().max(100_000),
  renderedSubject: z.string().max(500),
  renderedBodyText: z.string().max(100_000),
  confirmation: z
    .string()
    .describe('Copy the exact target-specific confirmation literal returned by preview'),
  confirmationDigest: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .describe('Copy the content-bound digest returned by preview'),
});
export const agentMailDeliveriesInput = z.object({
  limit: z.number().int().min(1).max(100).default(25),
});

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
    name: 'cicero_mail_templates_list',
    title: 'List agent mail templates',
    description:
      'Inspect effective email templates for this event, including exact source copy and whether the agent send flow may use each one.',
    access: 'read',
    inputSchema: emptyInput,
    outputSchema: z.object({ templates: z.array(agentMailTemplateSchema) }),
  },
  {
    name: 'cicero_mail_deliveries_list',
    title: 'List recent email deliveries',
    description:
      'Read recent event-scoped delivery metadata. Bodies and attachments stay redacted because they can contain one-click credentials.',
    access: 'read',
    inputSchema: agentMailDeliveriesInput,
    outputSchema: z.object({
      contentRedacted: z.literal(true),
      deliveries: z.array(
        z.object({
          id: z.string().uuid(),
          toEmail: z.string().email(),
          fromEmail: z.string(),
          subject: z.string(),
          templateKey: z.string().nullable(),
          status: z.enum(['queued', 'sent', 'failed']),
          error: z.string().nullable(),
          sentAt: z.string().datetime().nullable(),
          createdAt: z.string().datetime(),
        }),
      ),
    }),
  },
  {
    name: 'cicero_mail_preview',
    title: 'Preview one participant email',
    description:
      'Resolve one existing event participant against an enabled email template without sending or minting a live portal credential. Returns exact copy plus the confirmation required by send.',
    access: 'read',
    inputSchema: agentMailPreviewInput,
    outputSchema: z.object({
      channel: z.literal('email'),
      recipient: agentMailRecipientSchema.extend({ notifyEmail: z.literal(true) }),
      template: agentMailTemplateSchema,
      rendered: z.object({
        subject: z.string(),
        bodyText: z.string(),
        missingVariables: z.array(z.string()),
        unknownVariables: z.array(z.string()),
        dynamicFields: z.array(z.string()),
      }),
      confirmation: z.object({
        literal: z.string(),
        digest: z.string().regex(/^[a-f0-9]{64}$/),
        sendArguments: agentMailSendInput,
      }),
    }),
  },
  {
    name: 'cicero_mail_send',
    title: 'Send one confirmed participant email',
    description:
      'DESTRUCTIVE: send the exact previewed event template to one existing participant. Requires a write key, exact target-specific confirmation, and the content-bound preview digest. Email preference is rechecked; SMS is never sent.',
    access: 'write',
    inputSchema: agentMailSendInput,
    outputSchema: z.object({
      channel: z.literal('email'),
      recipient: agentMailRecipientSchema,
      templateKey: z.string(),
      subject: z.string(),
      bodyText: z.string(),
      logId: z.string().uuid(),
      sent: z.boolean(),
    }),
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
