import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { currentActor, currentEventId, listEventsForUser, redirect } = vi.hoisted(() => ({
  currentActor: vi.fn(),
  currentEventId: vi.fn(),
  listEventsForUser: vi.fn(),
  redirect: vi.fn((destination: string) => {
    throw new Error(`redirect:${destination}`);
  }),
}));

vi.mock('next/navigation', () => ({ redirect }));
vi.mock('@/lib/auth', () => ({ currentActor }));
vi.mock('@/lib/services/events', () => ({ currentEventId, listEventsForUser }));
vi.mock('../admin/AdminShell', () => ({ AdminShell: vi.fn() }));
vi.mock('./CrmNav', () => ({ CrmNav: vi.fn() }));

import { AdminShell } from '../admin/AdminShell';
import CrmLayout from './layout';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const actor = { userId: 'user-1', email: 'person@example.com', name: 'Person' };
const event = (id: string, roles: string[]) => ({ id, name: id, slug: id, roles });

describe('CRM route authorization', () => {
  beforeEach(() => {
    currentActor.mockReset();
    currentEventId.mockReset();
    listEventsForUser.mockReset();
    redirect.mockClear();
    currentActor.mockResolvedValue(actor);
    currentEventId.mockResolvedValue('organized-event');
  });

  it('sends an unauthenticated visitor to sign in', async () => {
    currentActor.mockResolvedValue(null);

    await expect(CrmLayout({ children: null })).rejects.toThrow(
      'redirect:/signin?next=/crm',
    );
  });

  it('sends a speaker-only visitor to the speaker portal', async () => {
    listEventsForUser.mockResolvedValue([event('speaker-event', ['speaker'])]);

    await expect(CrmLayout({ children: null })).rejects.toThrow('redirect:/portal');
  });

  it('sends a reviewer-only visitor to the review queue', async () => {
    listEventsForUser.mockResolvedValue([event('review-event', ['reviewer'])]);

    await expect(CrmLayout({ children: null })).rejects.toThrow('redirect:/review');
  });

  it('renders the organizer shell with organizer events only', async () => {
    listEventsForUser.mockResolvedValue([
      event('speaker-event', ['speaker']),
      event('organized-event', ['organizer']),
    ]);

    const result = await CrmLayout({ children: null });

    expect(result.type).toBe(AdminShell);
    expect(result.props.currentEventId).toBe('organized-event');
    expect(result.props.events).toEqual([event('organized-event', ['organizer'])]);
  });
});
