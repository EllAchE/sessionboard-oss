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

  it('keeps event discovery public and every speaker mutation authenticated', () => {
    const spec = buildSpec('https://cicero.test') as {
      paths: Record<
        string,
        {
          get?: { security?: unknown };
          patch?: { security?: unknown };
          post?: { security?: unknown };
          put?: { security?: unknown };
        }
      >;
    };
    const speakerSecurity = [{ speakerBearerAuth: [] }, { speakerCookieAuth: [] }];

    expect(spec.paths['/events/{slug}/sessions'].get?.security).toBeUndefined();
    expect(spec.paths['/events/{slug}/speakers'].get?.security).toBeUndefined();
    expect(spec.paths['/events/{slug}/forms'].get?.security).toBeUndefined();
    expect(spec.paths['/events/{slug}/forms/{formId}'].get?.security).toBeUndefined();
    expect(spec.paths['/events/{slug}/forms/{formId}/submissions'].post?.security).toEqual(
      speakerSecurity,
    );
    expect(spec.paths['/events/{slug}/me/profile'].patch?.security).toEqual(speakerSecurity);
    expect(spec.paths['/events/{slug}/me/submissions/{submissionId}'].put?.security).toEqual(
      speakerSecurity,
    );
    expect(
      spec.paths['/events/{slug}/me/submissions/{submissionId}/withdraw'].post?.security,
    ).toEqual(speakerSecurity);
    expect(spec.paths['/events/{slug}/me/tasks/{assignmentId}/complete'].post?.security).toEqual(
      speakerSecurity,
    );
  });
});
