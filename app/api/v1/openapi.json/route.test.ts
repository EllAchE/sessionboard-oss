import { describe, expect, it } from 'vitest';
import committedSpec from '@/docs/openapi.json';
import { buildSpec } from './route';

describe('OpenAPI documentation', () => {
  it('keeps docs/openapi.json in sync with the generated API contract', () => {
    expect(buildSpec('https://cicero.lhar8771.workers.dev')).toEqual(committedSpec);
  });

  it('advertises the authenticated program reconciliation contract', () => {
    const spec = buildSpec('https://cicero.test') as {
      paths: Record<string, { post?: { security?: unknown; requestBody?: unknown } }>;
    };
    expect(spec.paths['/events/{slug}/program/reconcile'].post).toMatchObject({
      operationId: 'reconcileProgram',
      security: [{ bearerAuth: [] }],
    });
    expect(spec.paths['/events/{slug}/program/reconcile'].post?.requestBody).toBeDefined();
  });
});
