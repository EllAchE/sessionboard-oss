import { z } from 'zod';

/**
 * `Z-5`: the spec is generated from the Zod schemas, never hand-written. A walker rather than a
 * dependency because `zod-to-openapi` is not installed — and the subset of Zod this API uses is
 * small and entirely under our control.
 *
 * Anything not handled below degrades to `{}`, which is a valid "any" in JSON Schema, so an
 * unrecognised type produces a permissive spec rather than a wrong one. That is a kind fallback in
 * the ordinary case and a dangerous one here: Zod 4 moved every internal this file reads, from
 * `_def.typeName: 'ZodString'` to `_zod.def.type: 'string'`, and a version skew would therefore
 * produce a spec that is empty rather than a build that fails. `openapi.test.ts` pins enough of the
 * output that the walker cannot quietly stop recognising the schemas it is walking.
 */

export type JsonSchema = Record<string, unknown>;

/** Zod 4 keeps the shape of a schema under `_zod.def`, and its refinements under `check._zod.def`. */
type ZodDef = {
  type: string;
  innerType?: z.ZodTypeAny;
  in?: z.ZodTypeAny;
  out?: z.ZodTypeAny;
  element?: z.ZodTypeAny;
  valueType?: z.ZodTypeAny;
  options?: z.ZodTypeAny[];
  entries?: Record<string, string>;
  values?: unknown[];
  catchall?: z.ZodTypeAny;
  checks?: { _zod: { def: Record<string, unknown> } }[];
};

function defOf(schema: z.ZodTypeAny): ZodDef {
  return (schema as unknown as { _zod: { def: ZodDef } })._zod.def;
}

function checksOf(def: ZodDef): Record<string, unknown>[] {
  return (def.checks ?? []).map((check) => check._zod.def);
}

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
  let description = current.description;

  for (;;) {
    const def = defOf(current);
    description = description ?? current.description;

    if (def.type === 'optional') {
      optional = true;
      current = def.innerType!;
      continue;
    }
    if (def.type === 'nullable') {
      nullable = true;
      current = def.innerType!;
      continue;
    }
    if (def.type === 'default' || def.type === 'catch') {
      optional = true;
      current = def.innerType!;
      continue;
    }
    // `.transform()` and `z.preprocess()` are both pipes in Zod 4, and they face opposite ways:
    // a transform pipes the declared schema into a coercion, a preprocess pipes a coercion into
    // the declared schema. Either way the side that is not the `transform` is the one describing
    // the shape a caller sends — the `limit`/`offset` query params are preprocessed numbers, and
    // reading `in` unconditionally would document them as an untyped `{}`.
    if (def.type === 'pipe') {
      current = defOf(def.in!).type === 'transform' ? def.out! : def.in!;
      continue;
    }
    break;
  }

  return {
    schema: current,
    optional,
    nullable,
    description: description ?? current.description,
  };
}

export function toJsonSchema(input: z.ZodTypeAny): JsonSchema {
  const { schema, nullable, description } = unwrap(input);
  const def = defOf(schema);

  const base = ((): JsonSchema => {
    switch (def.type) {
      case 'string': {
        const out: JsonSchema = { type: 'string' };
        for (const check of checksOf(def)) {
          if (check.check === 'string_format') {
            if (check.format === 'email') out.format = 'email';
            if (check.format === 'url') out.format = 'uri';
            if (check.format === 'datetime') out.format = 'date-time';
          }
          if (check.check === 'min_length') out.minLength = check.minimum;
          if (check.check === 'max_length') out.maxLength = check.maximum;
        }
        return out;
      }
      case 'number': {
        const checks = checksOf(def);
        // `.int()` is a number *format* in Zod 4 rather than a range check of its own.
        const out: JsonSchema = {
          type: checks.some((c) => c.check === 'number_format' && c.format === 'safeint')
            ? 'integer'
            : 'number',
        };
        for (const check of checks) {
          if (check.check === 'greater_than') out.minimum = check.value;
          if (check.check === 'less_than') out.maximum = check.value;
        }
        return out;
      }
      case 'boolean':
        return { type: 'boolean' };
      case 'enum':
        return { type: 'string', enum: Object.values(def.entries ?? {}) };
      case 'literal':
        // Zod 4 literals hold a set; every one this API declares holds exactly one member.
        return { const: def.values?.[0] };
      case 'array':
        return { type: 'array', items: toJsonSchema(def.element!) };
      case 'record':
        return { type: 'object', additionalProperties: toJsonSchema(def.valueType!) };
      case 'union':
        return { anyOf: (def.options ?? []).map(toJsonSchema) };
      case 'null':
        return { type: 'null' };
      case 'object': {
        const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
        const properties: Record<string, JsonSchema> = {};
        const required: string[] = [];

        for (const [key, value] of Object.entries(shape)) {
          properties[key] = toJsonSchema(value as z.ZodTypeAny);
          if (!unwrap(value as z.ZodTypeAny).optional) required.push(key);
        }

        const out: JsonSchema = { type: 'object', properties };
        // `z.strictObject` is a `never` catchall in Zod 4, where it used to be `unknownKeys`.
        if (def.catchall && defOf(def.catchall).type === 'never') out.additionalProperties = false;
        if (required.length > 0) out.required = required;
        return out;
      }
      case 'unknown':
      case 'any':
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
