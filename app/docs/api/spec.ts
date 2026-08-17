import spec from '@/docs/openapi.json';

/**
 * The reading half of the API reference: everything the page knows about the API it reads out of
 * `docs/openapi.json`, which CI holds equal to what `/api/v1/openapi.json` generates from the Zod
 * schemas in `app/api/v1/_lib/schemas.ts`.
 *
 * Nothing in here hard-codes an endpoint, a parameter, or a field name. The page can therefore not
 * describe an operation the API does not serve, and an operation cannot ship without appearing.
 */

export interface JsonSchema {
  $ref?: string;
  type?: string | string[];
  format?: string;
  enum?: unknown[];
  const?: unknown;
  description?: string;
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
}

export interface Parameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema?: JsonSchema;
}

export interface MediaType {
  schema?: JsonSchema;
}

export interface Response {
  description?: string;
  content?: Record<string, MediaType>;
}

export interface Operation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  security?: Array<Record<string, string[]>>;
  parameters?: Parameter[];
  requestBody?: { required?: boolean; description?: string; content?: Record<string, MediaType> };
  responses?: Record<string, Response>;
}

export interface SecurityScheme {
  type: string;
  scheme?: string;
  in?: string;
  name?: string;
  description?: string;
}

export interface SpecShape {
  openapi: string;
  info: { title: string; version: string; description: string };
  servers?: Array<{ url: string }>;
  tags?: Array<{ name: string; description?: string }>;
  components?: {
    schemas?: Record<string, JsonSchema>;
    securitySchemes?: Record<string, SecurityScheme>;
  };
  paths: Record<string, Record<string, Operation>>;
}

export const doc = spec as unknown as SpecShape;

export const baseUrl = doc.servers?.[0]?.url ?? '';

/** HTTP verbs in the order a reader expects them, which is not the order JSON keys arrive in. */
export const METHOD_ORDER = ['get', 'post', 'put', 'patch', 'delete'] as const;

export type Credential = { label: string; kind: 'public' | 'key' | 'speaker'; schemes: string[] };

/** Which credential an operation asks for, in the words a reader needs rather than scheme ids. */
export function credentialOf(operation: Operation): Credential {
  const schemes = [...new Set((operation.security ?? []).flatMap((entry) => Object.keys(entry)))];
  if (schemes.length === 0) return { label: 'Public', kind: 'public', schemes };
  if (schemes.includes('bearerAuth')) return { label: 'Event API key', kind: 'key', schemes };
  return { label: 'Speaker session', kind: 'speaker', schemes };
}

export interface Endpoint {
  /** Stable, deep-linkable element id. Derived from the spec's own operationId where there is one. */
  anchor: string;
  operationId: string;
  method: string;
  path: string;
  tag: string;
  summary: string;
  description?: string;
  credential: Credential;
  operation: Operation;
}

export interface TagGroup {
  name: string;
  anchor: string;
  description?: string;
  endpoints: Endpoint[];
}

export function slugify(value: string): string {
  return (
    value
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'section'
  );
}

/** Every operation in the spec, flattened, in path order and then conventional method order. */
export function allEndpoints(): Endpoint[] {
  const endpoints: Endpoint[] = [];

  for (const [path, operations] of Object.entries(doc.paths)) {
    for (const method of METHOD_ORDER) {
      const operation = operations[method];
      if (!operation) continue;
      const operationId = operation.operationId ?? `${method}-${path}`;
      endpoints.push({
        anchor: `op-${slugify(operationId)}`,
        operationId,
        method: method.toUpperCase(),
        path,
        tag: operation.tags?.[0] ?? 'Other',
        summary: operation.summary ?? '',
        description: operation.description,
        credential: credentialOf(operation),
        operation,
      });
    }
  }

  return endpoints;
}

/** Grouped by the spec's own tags, in the spec's own order, so the two cannot drift apart. */
export function endpointsByTag(): TagGroup[] {
  const groups = new Map<string, Endpoint[]>();
  for (const endpoint of allEndpoints()) {
    groups.set(endpoint.tag, [...(groups.get(endpoint.tag) ?? []), endpoint]);
  }

  const ordered: TagGroup[] = (doc.tags ?? []).map((tag) => ({
    name: tag.name,
    anchor: `tag-${slugify(tag.name)}`,
    description: tag.description,
    endpoints: groups.get(tag.name) ?? [],
  }));

  // Anything the spec tagged with a name it never declared still has to appear.
  for (const [name, endpoints] of groups) {
    if (!ordered.some((group) => group.name === name)) {
      ordered.push({ name, anchor: `tag-${slugify(name)}`, description: undefined, endpoints });
    }
  }

  return ordered.filter((group) => group.endpoints.length > 0);
}

export function findEndpoint(operationId: string): Endpoint | undefined {
  return allEndpoints().find((endpoint) => endpoint.operationId === operationId);
}

/** The name a `$ref` points at, e.g. `#/components/schemas/Session` -> `Session`. */
export function refName(schema: JsonSchema | undefined): string | undefined {
  if (!schema?.$ref) return undefined;
  return schema.$ref.split('/').pop();
}

/**
 * Follow `$ref` into `components.schemas`. The generated spec inlines everything below the top
 * level, so a single hop is always enough; the loop is there so a future nested ref cannot silently
 * render as an empty object, and the visit set keeps a malformed self-reference from hanging.
 */
export function resolveSchema(schema: JsonSchema | undefined): JsonSchema | undefined {
  let current = schema;
  const seen = new Set<string>();
  while (current?.$ref) {
    if (seen.has(current.$ref)) return undefined;
    seen.add(current.$ref);
    const name = current.$ref.split('/').pop();
    current = name ? doc.components?.schemas?.[name] : undefined;
  }
  return current;
}

export function jsonSchemaOf(content: Record<string, MediaType> | undefined): JsonSchema | undefined {
  return content?.['application/json']?.schema;
}

/** A one-line type for a field, with `$ref`s shown by the name they resolve to. */
export function typeLabel(schema: JsonSchema | undefined): string {
  if (!schema) return 'any';

  const named = refName(schema);
  if (named) return named;

  if ('const' in schema && schema.const !== undefined) return JSON.stringify(schema.const);

  if (schema.anyOf ?? schema.oneOf) {
    const branches = (schema.anyOf ?? schema.oneOf ?? []).map((branch) => typeLabel(branch));
    return [...new Set(branches)].join(' | ');
  }

  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];

  const label = types
    .map((type) => {
      if (type === 'array') {
        return `${typeLabel(schema.items)}[]`;
      }
      if (type === 'object' && schema.additionalProperties && schema.additionalProperties !== true) {
        return `map<string, ${typeLabel(schema.additionalProperties as JsonSchema)}>`;
      }
      if (type === 'string' && schema.format) return `string (${schema.format})`;
      return type;
    })
    .join(' | ');

  return label || (schema.properties ? 'object' : 'any');
}

/** Value constraints worth printing next to a field: enums, lengths, bounds. */
export function constraintsOf(schema: JsonSchema | undefined): string[] {
  if (!schema) return [];
  const notes: string[] = [];

  if (schema.enum) notes.push(`one of ${schema.enum.map((value) => JSON.stringify(value)).join(', ')}`);
  if ('const' in schema && schema.const !== undefined) notes.push(`always ${JSON.stringify(schema.const)}`);
  if (schema.minLength !== undefined) notes.push(`min length ${schema.minLength}`);
  if (schema.maxLength !== undefined) notes.push(`max length ${schema.maxLength}`);
  if (schema.minimum !== undefined) notes.push(`min ${schema.minimum}`);
  if (schema.maximum !== undefined) notes.push(`max ${schema.maximum}`);

  return notes;
}

/**
 * The object whose properties should be listed for a schema: the schema itself, the element type of
 * an array, or the value type of a map. Returns undefined when there is nothing to expand.
 */
export function expandable(schema: JsonSchema | undefined): JsonSchema | undefined {
  const resolved = resolveSchema(schema);
  if (!resolved) return undefined;
  if (resolved.properties) return resolved;

  const types = Array.isArray(resolved.type) ? resolved.type : resolved.type ? [resolved.type] : [];
  if (types.includes('array')) return expandable(resolved.items);
  if (resolved.additionalProperties && resolved.additionalProperties !== true) {
    return expandable(resolved.additionalProperties as JsonSchema);
  }
  return undefined;
}

export interface StatusGroup {
  status: string;
  description: string;
  schema?: JsonSchema;
}

/**
 * Success responses get their schema drawn out; failures are collapsed to a status list because the
 * generated spec gives every one of them the same `Error` body. If that ever stops being true the
 * odd one out falls back into `detailed` and is rendered in full.
 */
export function partitionResponses(operation: Operation): {
  success: StatusGroup[];
  errors: StatusGroup[];
  detailed: StatusGroup[];
} {
  const success: StatusGroup[] = [];
  const errors: StatusGroup[] = [];
  const detailed: StatusGroup[] = [];

  for (const [status, response] of Object.entries(operation.responses ?? {})) {
    const schema = jsonSchemaOf(response.content);
    const entry: StatusGroup = { status, description: response.description ?? '', schema };
    if (status.startsWith('2')) success.push(entry);
    else if (refName(schema) === 'Error') errors.push(entry);
    else detailed.push(entry);
  }

  const byStatus = (a: StatusGroup, b: StatusGroup) => a.status.localeCompare(b.status);
  return { success: success.sort(byStatus), errors: errors.sort(byStatus), detailed: detailed.sort(byStatus) };
}
