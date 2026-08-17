import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import spec from '@/docs/openapi.json';
import { curlFor, EXAMPLES, urlFor } from './examples';
import ApiDocsPage from './page';
import {
  allEndpoints,
  baseUrl,
  doc,
  expandable,
  findEndpoint,
  jsonSchemaOf,
  refName,
  resolveSchema,
  type JsonSchema,
} from './spec';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const html = renderToStaticMarkup(<ApiDocsPage />);
const endpoints = allEndpoints();

/**
 * The page is a projection of the committed spec, so the test is too: it asserts the projection
 * covers everything rather than pinning a handful of paths that would go stale the moment an
 * endpoint is added. The worked examples are the only authored content on the page, so they are
 * validated against the spec's own request and response schemas — an example that drops a field the
 * API added, or keeps one it removed, fails here.
 */

/** The slice of markup belonging to one endpoint: its anchor up to the next one. */
function sectionFor(anchor: string): string {
  const marks = endpoints
    .map((endpoint) => ({ anchor: endpoint.anchor, at: html.indexOf(`id="${endpoint.anchor}"`) }))
    .sort((a, b) => a.at - b.at);

  const index = marks.findIndex((mark) => mark.anchor === anchor);
  expect(marks[index]?.at, `${anchor} has no anchor in the markup`).toBeGreaterThan(-1);
  const end = index + 1 < marks.length ? marks[index + 1].at : html.length;
  return html.slice(marks[index].at, end);
}

/** Every `$ref` name reachable from a schema, so we can assert the page resolved rather than elided it. */
function referencedNames(schema: JsonSchema | undefined, depth = 0): string[] {
  if (!schema || depth > 3) return [];
  const names: string[] = [];
  const named = refName(schema);
  if (named) names.push(named);
  const resolved = resolveSchema(schema);
  if (!resolved) return names;
  for (const property of Object.values(resolved.properties ?? {})) {
    names.push(...referencedNames(property, depth + 1));
  }
  if (resolved.items) names.push(...referencedNames(resolved.items, depth + 1));
  return names;
}

describe('API reference page', () => {
  it('lists every path in the spec', () => {
    for (const path of Object.keys(spec.paths)) {
      expect(html, `${path} is missing from the reference`).toContain(path);
    }
  });

  it('points at the machine-readable spec it was generated from', () => {
    expect(html).toContain('href="/api/v1/openapi.json"');
  });

  it('says which credential an endpoint wants', () => {
    expect(html).toContain('Public');
    expect(html).toContain('Event API key');
    expect(html).toContain('Speaker session');
  });

  it('gives every operation a deep-linkable id and a navigation entry', () => {
    const anchors = new Set<string>();
    for (const endpoint of endpoints) {
      expect(anchors.has(endpoint.anchor), `${endpoint.anchor} is not unique`).toBe(false);
      anchors.add(endpoint.anchor);
      expect(html, `${endpoint.operationId} has no anchor`).toContain(`id="${endpoint.anchor}"`);
      expect(html, `${endpoint.operationId} is not in the index`).toContain(`href="#${endpoint.anchor}"`);
    }
  });

  it('indexes every tag the spec declares', () => {
    for (const group of doc.tags ?? []) {
      const anchor = `tag-${group.name.toLowerCase()}`;
      expect(html, `${group.name} has no section`).toContain(`id="${anchor}"`);
      expect(html, `${group.name} is not in the index`).toContain(`href="#${anchor}"`);
    }
  });

  it('documents every parameter, with its requiredness, on its own endpoint', () => {
    for (const endpoint of endpoints) {
      const section = sectionFor(endpoint.anchor);
      const parameters = endpoint.operation.parameters ?? [];
      for (const parameter of parameters) {
        expect(section, `${endpoint.operationId} omits ${parameter.in} parameter ${parameter.name}`)
          .toContain(`>${parameter.name}</code>`);
      }
      if (parameters.some((parameter) => parameter.required)) expect(section).toContain('required');
      if (parameters.some((parameter) => !parameter.required)) expect(section).toContain('optional');
    }
  });

  it('documents every request body field on its own endpoint', () => {
    for (const endpoint of endpoints) {
      const schema = jsonSchemaOf(endpoint.operation.requestBody?.content);
      if (!schema) continue;
      const section = sectionFor(endpoint.anchor);
      const fields = expandable(schema)?.properties ?? {};
      expect(Object.keys(fields).length, `${endpoint.operationId} has an unreadable request body`)
        .toBeGreaterThan(0);
      for (const name of Object.keys(fields)) {
        expect(section, `${endpoint.operationId} omits request field ${name}`).toContain(`>${name}</code>`);
      }
    }
  });

  it('documents every declared status code on its own endpoint', () => {
    for (const endpoint of endpoints) {
      const section = sectionFor(endpoint.anchor);
      for (const status of Object.keys(endpoint.operation.responses ?? {})) {
        expect(section, `${endpoint.operationId} omits status ${status}`).toContain(`>${status}<`);
      }
    }
  });

  it('resolves response $refs into the schemas they name', () => {
    for (const endpoint of endpoints) {
      const section = sectionFor(endpoint.anchor);
      for (const [status, response] of Object.entries(endpoint.operation.responses ?? {})) {
        if (!status.startsWith('2')) continue;
        const schema = jsonSchemaOf(response.content);
        for (const name of new Set(referencedNames(schema))) {
          expect(section, `${endpoint.operationId} ${status} never names ${name}`).toContain(name);
        }
        // A success body with fields must show them, not just its type line.
        for (const field of Object.keys(expandable(schema)?.properties ?? {})) {
          expect(section, `${endpoint.operationId} ${status} omits field ${field}`)
            .toContain(`>${field}</code>`);
        }
      }
    }
  });

  it('explains the shared error body once', () => {
    expect(html).toContain('id="errors"');
    const errorSchema = resolveSchema({ $ref: '#/components/schemas/Error' });
    expect(errorSchema, 'the spec no longer declares an Error schema').toBeDefined();
    expect(html).toContain('>error</code>');
  });
});

/** Structural validation of an authored sample against a spec schema. Returns human-readable failures. */
function validate(value: unknown, schema: JsonSchema | undefined, at = '$'): string[] {
  const resolved = resolveSchema(schema);
  if (!resolved) return [];

  if (resolved.anyOf ?? resolved.oneOf) {
    const branches = resolved.anyOf ?? resolved.oneOf ?? [];
    if (branches.some((branch) => validate(value, branch, at).length === 0)) return [];
    return [`${at}: matches none of the allowed variants`];
  }

  if ('const' in resolved && resolved.const !== undefined) {
    return JSON.stringify(value) === JSON.stringify(resolved.const)
      ? []
      : [`${at}: expected ${JSON.stringify(resolved.const)}`];
  }

  const types = Array.isArray(resolved.type) ? resolved.type : resolved.type ? [resolved.type] : [];

  if (value === null) {
    return types.length === 0 || types.includes('null') ? [] : [`${at}: null is not allowed`];
  }

  if (resolved.enum && !resolved.enum.some((option) => JSON.stringify(option) === JSON.stringify(value))) {
    return [`${at}: ${JSON.stringify(value)} is not one of ${JSON.stringify(resolved.enum)}`];
  }

  if (types.includes('array')) {
    if (!Array.isArray(value)) return [`${at}: expected an array`];
    return value.flatMap((item, index) => validate(item, resolved.items, `${at}[${index}]`));
  }

  if (types.includes('object')) {
    if (typeof value !== 'object' || Array.isArray(value)) return [`${at}: expected an object`];
    const record = value as Record<string, unknown>;
    const errors: string[] = [];

    for (const key of resolved.required ?? []) {
      if (!(key in record)) errors.push(`${at}.${key}: required field is missing from the example`);
    }

    for (const [key, entry] of Object.entries(record)) {
      const property = resolved.properties?.[key];
      if (property) {
        errors.push(...validate(entry, property, `${at}.${key}`));
      } else if (resolved.additionalProperties && resolved.additionalProperties !== true) {
        errors.push(...validate(entry, resolved.additionalProperties as JsonSchema, `${at}.${key}`));
      } else if (!resolved.additionalProperties) {
        errors.push(`${at}.${key}: the schema does not declare this field`);
      }
    }

    return errors;
  }

  if (types.includes('string') && typeof value !== 'string') return [`${at}: expected a string`];
  if (types.includes('integer') && !Number.isInteger(value)) return [`${at}: expected an integer`];
  if (types.includes('number') && typeof value !== 'number') return [`${at}: expected a number`];
  if (types.includes('boolean') && typeof value !== 'boolean') return [`${at}: expected a boolean`];

  return [];
}

describe('worked examples', () => {
  it('covers every tag group', () => {
    for (const group of doc.tags ?? []) {
      const covered = EXAMPLES.some(
        (example) => findEndpoint(example.operationId)?.tag === group.name,
      );
      expect(covered, `${group.name} has no worked example`).toBe(true);
    }
  });

  for (const example of EXAMPLES) {
    describe(example.operationId, () => {
      const endpoint = findEndpoint(example.operationId);

      it('names an operation the spec still serves', () => {
        expect(endpoint, `${example.operationId} is not in the spec`).toBeDefined();
      });

      it('supplies every path parameter and only declared query parameters', () => {
        if (!endpoint) return;
        const parameters = endpoint.operation.parameters ?? [];
        for (const parameter of parameters.filter((entry) => entry.in === 'path')) {
          expect(example.pathParams[parameter.name], `no value for {${parameter.name}}`).toBeDefined();
        }
        const declared = new Set(
          parameters.filter((entry) => entry.in === 'query').map((entry) => entry.name),
        );
        for (const key of Object.keys(example.query ?? {})) {
          expect(declared.has(key), `${key} is not a query parameter of ${example.operationId}`).toBe(true);
        }
      });

      it('sends a body the request schema accepts', () => {
        if (!endpoint) return;
        const schema = jsonSchemaOf(endpoint.operation.requestBody?.content);
        if (example.body === undefined) {
          expect(endpoint.operation.requestBody?.required ?? false).toBe(false);
          return;
        }
        expect(schema, `${example.operationId} takes no request body`).toBeDefined();
        expect(validate(example.body, schema, 'body')).toEqual([]);
      });

      it('shows a response the schema for that status accepts', () => {
        if (!endpoint) return;
        const response = endpoint.operation.responses?.[example.status];
        expect(response, `${example.operationId} does not document ${example.status}`).toBeDefined();
        expect(validate(example.response, jsonSchemaOf(response?.content), 'response')).toEqual([]);
      });

      it('builds a request line from the spec, not by hand', () => {
        if (!endpoint) return;
        const command = curlFor(example);
        expect(command).toBeDefined();
        expect(command).toContain(baseUrl);
        expect(urlFor(example, endpoint)).not.toContain('{');
        if (endpoint.method !== 'GET') expect(command).toContain(`-X ${endpoint.method}`);
        if (endpoint.credential.kind !== 'public') expect(command).toContain('Authorization: Bearer');
        else expect(command).not.toContain('Authorization');
      });

      it('is rendered on the page it documents', () => {
        if (!endpoint) return;
        // React escapes `&` in query strings on the way into the markup.
        expect(html.replaceAll('&amp;', '&')).toContain(urlFor(example, endpoint));
      });
    });
  }
});

describe('styling', () => {
  it('uses design tokens rather than new colour literals', () => {
    const css = readFileSync(new URL('./api-docs.module.css', import.meta.url), 'utf8');
    const literals = css.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(/g) ?? [];
    expect(literals, `colour literals: ${literals.join(', ')}`).toEqual([]);
  });
});
