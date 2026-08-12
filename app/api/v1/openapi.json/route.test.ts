import { describe, expect, it } from 'vitest';
import committedSpec from '@/docs/openapi.json';
import { buildSpec } from './route';

describe('OpenAPI documentation', () => {
  it('keeps docs/openapi.json in sync with the generated API contract', () => {
    expect(buildSpec('https://cicero.lhar8771.workers.dev')).toEqual(committedSpec);
  });
});
