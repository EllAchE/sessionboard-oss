import { describe, expect, it, vi } from 'vitest';

const { cancelPublishedSessionBeforeMutation, order } = vi.hoisted(() => ({
  cancelPublishedSessionBeforeMutation: vi.fn(async () => undefined),
  order: [] as string[],
}));

vi.mock('@/lib/services/agenda-mutations', () => ({
  allocateSessionRef: vi.fn(),
  cancelPublishedSessionBeforeMutation,
  mintIcsUid: vi.fn(),
  notifyIfPublished: vi.fn(),
}));

import type { Database } from '../../db/client';
import { reconcileProgram, type ProgramReconcileInput } from './program-reconcile';

describe('program reconciliation calendar boundary', () => {
  it('sends a published cancellation before a database write that later fails', async () => {
    order.length = 0;
    cancelPublishedSessionBeforeMutation.mockImplementationOnce(async () => {
      order.push('cancel');
    });

    const stored = {
      id: 'session-1',
      clientId: 'accelevents:ae-1',
      title: 'Published motion',
      descriptionMarkdown: null,
      status: 'published' as const,
      startsAt: new Date('2027-01-13T08:00:00.000Z'),
      endsAt: new Date('2027-01-13T08:45:00.000Z'),
      roomId: 'room-1',
      trackId: null,
      formatId: null,
      ceuCredits: null,
    };
    const database = {
      query: {
        scheduledSession: { findMany: async () => [stored] },
        room: { findMany: async () => [{ id: 'room-1', name: 'Curia Julia' }] },
        track: { findMany: async () => [] },
        sessionFormat: { findMany: async () => [] },
        event: { findFirst: async () => ({ agendaConflictPolicy: 'warn' }) },
      },
      execute: async () => undefined,
      transaction: async (work: (transaction: unknown) => Promise<unknown>) => work(database),
      update: () => ({
        set: () => ({
          where: async () => {
            order.push('write');
            throw new Error('database write failed');
          },
        }),
      }),
    } as unknown as Database;
    const input: ProgramReconcileInput = {
      source: 'accelevents',
      mode: 'merge',
      apply: true,
      sessions: [
        {
          externalId: 'ae-1',
          title: 'Published motion',
          description: null,
          status: 'draft',
          startsAt: null,
          endsAt: null,
          room: null,
          track: null,
          format: null,
          ceuCredits: null,
        },
      ],
      deleteExternalIds: [],
    };

    await expect(reconcileProgram('event-1', input, database)).rejects.toThrow(
      'database write failed',
    );
    expect(order).toEqual(['cancel', 'write']);
  });
});
