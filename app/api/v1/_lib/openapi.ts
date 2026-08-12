import { z } from 'zod';

/**
 * `Z-5`: the spec is generated from the Zod schemas, never hand-written. A walker rather than a
 * dependency because `zod-to-openapi` is not installed and `package.json` is frozen — and the
 * subset of Zod this API uses is small and entirely under our control.
 *
 * Anything not handled below degrades to `{}`, which is a valid "any" in JSON Schema, so an
 * unrecognised type produces a permissive spec rather than a wrong one.
 */

export type JsonSchema = Record<string, unknown>;

type Unwrapped = {
  schema: z.ZodTypeAny;
  optional: boolean;
  nullable: boolean;
  description?: string;
};

function unwrap(schema: z.ZodTypeAny): Unwrapped {
  let current = schema;
  let optional = false;
  let nullable = false;
  let description = current._def.description as string | undefined;

  for (;;) {
    const def = current._def as {
      typeName?: string;
      innerType?: z.ZodTypeAny;
      description?: string;
    };
    description = description ?? def.description;

    if (def.typeName === 'ZodOptional') {
      optional = true;
      current = def.innerType as z.ZodTypeAny;
      continue;
    }
    if (def.typeName === 'ZodNullable') {
      nullable = true;
      current = def.innerType as z.ZodTypeAny;
      continue;
    }
    if (def.typeName === 'ZodDefault' || def.typeName === 'ZodCatch') {
      optional = true;
      current = def.innerType as z.ZodTypeAny;
      continue;
    }
    if (def.typeName === 'ZodEffects') {
      current = (current._def as unknown as { schema: z.ZodTypeAny }).schema;
      continue;
    }
    break;
  }

  return {
    schema: current,
    optional,
    nullable,
    description: description ?? current._def.description,
  };
}

export function toJsonSchema(input: z.ZodTypeAny): JsonSchema {
  const { schema, nullable, description } = unwrap(input);
  const def = schema._def as Record<string, unknown>;
  const typeName = def.typeName as string;

  const base = ((): JsonSchema => {
    switch (typeName) {
      case 'ZodString': {
        const out: JsonSchema = { type: 'string' };
        for (const check of (def.checks as {
          kind: string;
          value?: unknown;
        }[]) ?? []) {
          if (check.kind === 'email') out.format = 'email';
          if (check.kind === 'url') out.format = 'uri';
          if (check.kind === 'min') out.minLength = check.value;
          if (check.kind === 'max') out.maxLength = check.value;
        }
        return out;
      }
      case 'ZodNumber': {
        const checks = (def.checks as { kind: string; value?: unknown }[]) ?? [];
        const out: JsonSchema = {
          type: checks.some((c) => c.kind === 'int') ? 'integer' : 'number',
        };
        for (const check of checks) {
          if (check.kind === 'min') out.minimum = check.value;
          if (check.kind === 'max') out.maximum = check.value;
        }
        return out;
      }
      case 'ZodBoolean':
        return { type: 'boolean' };
      case 'ZodEnum':
        return { type: 'string', enum: def.values as string[] };
      case 'ZodLiteral':
        return { const: def.value };
      case 'ZodArray':
        return { type: 'array', items: toJsonSchema(def.type as z.ZodTypeAny) };
      case 'ZodRecord':
        return {
          type: 'object',
          additionalProperties: toJsonSchema(def.valueType as z.ZodTypeAny),
        };
      case 'ZodUnion':
        return { anyOf: (def.options as z.ZodTypeAny[]).map(toJsonSchema) };
      case 'ZodNull':
        return { type: 'null' };
      case 'ZodObject': {
        const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
        const properties: Record<string, JsonSchema> = {};
        const required: string[] = [];

        for (const [key, value] of Object.entries(shape)) {
          properties[key] = toJsonSchema(value as z.ZodTypeAny);
          if (!unwrap(value as z.ZodTypeAny).optional) required.push(key);
        }

        const out: JsonSchema = { type: 'object', properties };
        if (required.length > 0) out.required = required;
        return out;
      }
      case 'ZodUnknown':
      case 'ZodAny':
        return {};
      default:
        return {};
    }
  })();

  if (nullable && typeof base.type === 'string') base.type = [base.type, 'null'];
  if (description) base.description = description;
  return base;
}

/** Query parameters come from a flat object schema, one parameter per key. */
export function toParameters(
  schema: z.ZodObject<z.ZodRawShape>,
  location: 'query' | 'path',
): JsonSchema[] {
  return Object.entries(schema.shape).map(([name, value]) => {
    const { optional, description } = unwrap(value as z.ZodTypeAny);
    return {
      name,
      in: location,
      required: location === 'path' ? true : !optional,
      description,
      schema: toJsonSchema(value as z.ZodTypeAny),
    };
  });
}
