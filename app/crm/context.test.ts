import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listOrganizerEvents, requireCurrentActor } = vi.hoisted(() => ({
  listOrganizerEvents: vi.fn(),
  requireCurrentActor: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireCurrentActor }));
vi.mock('@/lib/services/crm', () => ({ listOrganizerEvents }));

import { requireCrmOrganizer } from './context';

const actor = { userId: 'user-1', email: 'person@example.com', name: 'Person' };

describe('CRM action authorization', () => {
  beforeEach(() => {
    requireCurrentActor.mockReset();
    listOrganizerEvents.mockReset();
    requireCurrentActor.mockResolvedValue(actor);
  });

  it('returns an actor with an organizer membership', async () => {
    listOrganizerEvents.mockResolvedValue([{ id: 'event-1' }]);

    await expect(requireCrmOrganizer()).resolves.toEqual(actor);
  });

  it('rejects a speaker-only or reviewer-only actor', async () => {
    listOrganizerEvents.mockResolvedValue([]);

    await expect(requireCrmOrganizer()).rejects.toMatchObject({ code: 'forbidden' });
  });
});
