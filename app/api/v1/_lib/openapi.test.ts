import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toJsonSchema, toParameters } from './openapi';
import {
  agendaSchema,
  sessionListQuery,
  sessionSchema,
  submissionListQuery,
  submissionSchema,
} from './schemas';

/**
 * The generator walks Zod's `_def` internals, which are not a public contract. These assertions are
 * the tripwire for a Zod upgrade quietly turning the published spec into `{}`.
 */

describe('toJsonSchema', () => {
  it('describes an object with its required keys', () => {
    const schema = toJsonSchema(z.object({ a: z.string(), b: z.number().optional() }));
    expect(schema.type).toBe('object');
    expect(schema.required).toEqual(['a']);
    expect((schema.properties as Record<string, { type: string }>).b.type).toBe('number');
  });

  it('publishes strict object boundaries', () => {
    expect(toJsonSchema(z.object({ value: z.string() }).strict()).additionalProperties).toBe(false);
  });

  it('renders a nullable field as a type union rather than dropping it', () => {
    const schema = toJsonSchema(z.object({ a: z.string().nullable() }));
    const field = (schema.properties as Record<string, { type: unknown }>).a;
    expect(field.type).toEqual(['string', 'null']);
  });

  it('carries enums, arrays and descriptions through', () => {
    const schema = toJsonSchema(
      z.object({
        status: z.enum(['draft', 'published']).describe('Publication state'),
        tags: z.array(z.string()),
      }),
    );
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.status.enum).toEqual(['draft', 'published']);
    expect(props.status.description).toBe('Publication state');
    expect(props.tags.type).toBe('array');
  });

  it('generates a non-empty schema for every published payload', () => {
    for (const schema of [sessionSchema, agendaSchema, submissionSchema]) {
      const generated = toJsonSchema(schema);
      expect(generated.type).toBe('object');
      expect(Object.keys(generated.properties as object).length).toBeGreaterThan(0);
    }
  });
});

describe('toParameters', () => {
  it('flattens a query schema into OpenAPI parameters', () => {
    const params = toParameters(sessionListQuery, 'query') as {
      name: string;
      in: string;
      required: boolean;
    }[];

    expect(params.length).toBeGreaterThan(0);
    expect(params.every((param) => param.in === 'query')).toBe(true);
    // Every filter on a public read is optional; a required one would break the bare `/sessions`.
    expect(params.every((param) => param.required === false)).toBe(true);
    expect(params.map((param) => param.name)).toContain('track');
  });

  it('publishes transformed numeric query limits as bounded integers', () => {
    const limit = toParameters(submissionListQuery, 'query').find(
      (parameter) => parameter.name === 'limit',
    );
    expect(limit?.schema).toMatchObject({ type: 'integer', minimum: 1, maximum: 200 });
  });
});
