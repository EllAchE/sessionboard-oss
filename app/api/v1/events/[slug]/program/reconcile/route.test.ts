import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/api/v1/_lib/auth', () => ({ requireApiKey: vi.fn() }));
vi.mock('@/lib/services/program-reconcile', () => ({ reconcileProgram: vi.fn() }));

import { requireApiKey } from '@/app/api/v1/_lib/auth';
import { programReconcileBody } from '@/app/api/v1/_lib/schemas';
import demoFixture from '@/docs/fixtures/first-settlement-accelevents-program.json';
import { reconcileProgram } from '@/lib/services/program-reconcile';
import { POST } from './route';

const mockedRequireApiKey = requireApiKey as unknown as ReturnType<typeof vi.fn>;
const mockedReconcileProgram = reconcileProgram as unknown as ReturnType<typeof vi.fn>;

describe('program reconciliation route', () => {
  beforeEach(() => {
    mockedRequireApiKey.mockReset();
    mockedRequireApiKey.mockResolvedValue({
      eventId: 'event-first-settlement',
      eventSlug: 'first-settlement',
      keyId: 'key-1',
      name: 'Demo integration',
      scope: 'write',
    });
    mockedReconcileProgram.mockReset();
    mockedReconcileProgram.mockResolvedValue({
      source: 'accelevents',
      mode: 'merge',
      applied: false,
      canApply: true,
      requiresDeleteConfirmation: false,
      summary: { create: 0, update: 0, delete: 0, noop: 0, error: 0 },
      operations: [],
    });
  });

  it('passes only the event id authenticated by the path-scoped API key', async () => {
    const request = new Request(
      'https://cicero.test/api/v1/events/first-settlement/program/reconcile',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-key',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ source: 'accelevents', sessions: [] }),
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ slug: 'first-settlement' }),
    });

    expect(response.status).toBe(200);
    expect(mockedRequireApiKey).toHaveBeenCalledWith(request, 'first-settlement', 'write');
    expect(mockedReconcileProgram).toHaveBeenCalledWith(
      'event-first-settlement',
      expect.objectContaining({ source: 'accelevents', mode: 'merge', apply: false }),
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('keeps the checked-in full collection preview-safe', () => {
    expect(programReconcileBody.parse(demoFixture)).toMatchObject({
      mode: 'replace',
      apply: false,
    });
    expect(demoFixture).not.toHaveProperty('confirmDeleteMissing');
  });
});
