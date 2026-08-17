import {
  createMcpHandler,
  fromJsonSchema,
  McpServer,
  type AuthInfo,
  type StandardSchemaWithJSON,
} from '@modelcontextprotocol/server';
import { z, type ZodTypeAny } from 'zod';
import { toJsonSchema } from '@/app/api/v1/_lib/openapi';
import { programReconcileBody } from '@/app/api/v1/_lib/schemas';
import { forbidden, isAppError, toPublicError } from '@/lib/errors';
import {
  listAgentMailDeliveries,
  listAgentMailTemplates,
  previewAgentMail,
  sendConfirmedAgentMail,
} from '@/lib/services/agent-mail';
import { reconcileProgram } from '@/lib/services/program-reconcile';
import {
  groupByDay,
  listSessions,
  listSpeakers,
  listSubmissions,
  requireEvent,
  toEventPayload,
} from '@/lib/services/public-api';
import {
  agentMailDeliveriesInput,
  agentMailPreviewInput,
  agentMailSendInput,
  MCP_TOOL_DEFINITIONS,
  type McpToolDefinition,
  type McpToolName,
} from './tools';

export type McpEventKey = {
  keyId: string;
  eventId: string;
  eventSlug: string;
  name: string;
  scopes: string[];
  token: string;
};

function schema<T>(source: ZodTypeAny): StandardSchemaWithJSON<unknown, T> {
  return fromJsonSchema<T>(toJsonSchema(source));
}

/**
 * Narrowed by the name, so `toolDefinition('cicero_sessions_list').inputSchema.parse(...)` gives
 * that tool's filters rather than the union of every tool's. Returning the union let a handler read
 * a field off the wrong tool's input and typecheck, and made the three list handlers below depend on
 * whichever member of the union Zod's inference happened to collapse to.
 */
function toolDefinition<TName extends McpToolName>(
  name: TName,
): Extract<McpToolDefinition, { name: TName }> {
  const definition = MCP_TOOL_DEFINITIONS.find((candidate) => candidate.name === name);
  if (!definition) throw new Error(`Unknown MCP tool: ${name}`);
  return definition as Extract<McpToolDefinition, { name: TName }>;
}

function result(value: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

function toolError(error: unknown) {
  const publicError = toPublicError(error);
  if (!isAppError(error)) console.error('MCP tool failed', error);
  return {
    isError: true,
    content: [{ type: 'text' as const, text: publicError.message }],
  };
}

function registerTool<TInput extends Record<string, unknown>>(
  server: McpServer,
  name: McpToolName,
  handler: (input: TInput) => Promise<Record<string, unknown>>,
) {
  const definition = toolDefinition(name);
  server.registerTool(
    name,
    {
      title: definition.title,
      description: definition.description,
      inputSchema: schema<TInput>(definition.inputSchema),
      outputSchema: schema<Record<string, unknown>>(definition.outputSchema),
      annotations: {
        readOnlyHint: definition.access === 'read',
        // Program reconciliation can delete source-managed sessions in confirmed replace mode.
        destructiveHint: definition.access === 'write',
        idempotentHint: definition.access === 'read',
      },
    },
    async (input) => {
      try {
        return result(await handler(input as TInput));
      } catch (error) {
        return toolError(error);
      }
    },
  );
}

export function createCiceroMcpServer(key: McpEventKey): McpServer {
  const server = new McpServer(
    { name: 'cicero', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  registerTool(server, 'cicero_event_get', async (raw) => {
    z.object({}).strict().parse(raw);
    const event = await requireEvent(key.eventSlug);
    return toEventPayload(event) as unknown as Record<string, unknown>;
  });

  registerTool(server, 'cicero_sessions_list', async (raw) => {
    const input = toolDefinition('cicero_sessions_list').inputSchema.parse(raw);
    return (await listSessions(key.eventId, input, { includeUnpublished: true })) as unknown as Record<
      string,
      unknown
    >;
  });

  registerTool(server, 'cicero_speakers_list', async (raw) => {
    const input = toolDefinition('cicero_speakers_list').inputSchema.parse(raw);
    return (await listSpeakers({ id: key.eventId, slug: key.eventSlug }, input)) as unknown as Record<
      string,
      unknown
    >;
  });

  registerTool(server, 'cicero_agenda_get', async (raw) => {
    z.object({}).strict().parse(raw);
    const event = await requireEvent(key.eventSlug);
    const sessions = await listSessions(
      key.eventId,
      { status: 'published' },
      { paginate: false },
    );
    const agenda = groupByDay(sessions.data, event.timezone);
    return {
      event: toEventPayload(event),
      days: agenda.days,
      unscheduled: agenda.unscheduled,
    };
  });

  registerTool(server, 'cicero_submissions_list', async (raw) => {
    const input = toolDefinition('cicero_submissions_list').inputSchema.parse(raw);
    const data = await listSubmissions(key.eventId, input);
    return { data, total: data.length };
  });

  registerTool(server, 'cicero_mail_templates_list', async (raw) => {
    z.object({}).strict().parse(raw);
    return { templates: await listAgentMailTemplates(key.eventId) };
  });

  registerTool(server, 'cicero_mail_deliveries_list', async (raw) => {
    const input = agentMailDeliveriesInput.parse(raw);
    return await listAgentMailDeliveries(key.eventId, input.limit);
  });

  registerTool(server, 'cicero_mail_preview', async (raw) => {
    const input = agentMailPreviewInput.parse(raw);
    return (await previewAgentMail({ ...input, eventId: key.eventId })) as unknown as Record<
      string,
      unknown
    >;
  });

  registerTool(server, 'cicero_mail_send', async (raw) => {
    if (!key.scopes.includes('write')) {
      throw forbidden('This API key does not have write access');
    }
    const input = agentMailSendInput.parse(raw);
    return (await sendConfirmedAgentMail({ ...input, eventId: key.eventId })) as unknown as Record<
      string,
      unknown
    >;
  });

  registerTool(server, 'cicero_program_reconcile', async (raw) => {
    if (!key.scopes.includes('write')) {
      throw forbidden('This API key does not have write access');
    }
    const input = programReconcileBody.parse(raw);
    return (await reconcileProgram(key.eventId, input)) as unknown as Record<string, unknown>;
  });

  return server;
}

export async function handleCiceroMcpRequest(request: Request, key: McpEventKey): Promise<Response> {
  const authInfo: AuthInfo = {
    token: key.token,
    clientId: key.keyId,
    scopes: key.scopes,
    extra: { eventId: key.eventId, eventSlug: key.eventSlug, keyName: key.name },
  };
  const handler = createMcpHandler(() => createCiceroMcpServer(key), {
    legacy: 'stateless',
    onerror(error) {
      console.error('MCP transport failed', error);
    },
  });
  return handler.fetch(request, { authInfo });
}
