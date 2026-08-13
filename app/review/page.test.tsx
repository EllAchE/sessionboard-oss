import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '@/lib/context';
import type { ReviewerAssignmentRow } from '@/lib/services/review';
import type { ReviewerSession } from './context';
import type { AssignmentWire, RoundWire } from './types';

/**
 * The queue route is an async server component, so rather than rendering it we await it and read
 * the props it hands the dashboard. That reaches the two things this file actually decides — where
 * a visitor without a reviewer session is sent, and how a service row becomes a wire row — without
 * a DOM or a server runtime.
 */

// The route files compile JSX to `React.createElement`, which expects a global — the same shim the
// other component tests in this repo install.
(globalThis as typeof globalThis & { React: typeof React }).React = React;

class RedirectError extends Error {
  constructor(readonly to: string) {
    super(`redirect:${to}`);
  }
}

const reviewerSession = vi.fn<() => Promise<ReviewerSession | null>>();
const currentActor = vi.fn<() => Promise<Actor | null>>();
const loadReviewerQueue = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new RedirectError(to);
  },
}));

vi.mock('@/lib/auth', () => ({ currentActor: () => currentActor() }));
vi.mock('./context', () => ({ reviewerSession: () => reviewerSession() }));
vi.mock('@/lib/services/review', () => ({
  loadReviewerQueue: (...args: unknown[]) => loadReviewerQueue(...args),
}));

const ReviewQueuePage = (await import('./page')).default;

const ACTOR: Actor = {
  userId: 'user-cicero',
  email: 'cicero@forum.example',
  name: 'Marcus Tullius Cicero',
  impersonatedByUserId: null,
};

const SESSION = {
  ctx: { actor: ACTOR, eventId: 'event-forum', roles: ['reviewer'] },
  event: { id: 'event-forum', name: 'The Forum' },
  canDecide: false,
} as ReviewerSession;

const row = (over: Partial<ReviewerAssignmentRow> & { submissionId: string }): ReviewerAssignmentRow => ({
  assignmentId: `assignment-${over.submissionId}`,
  ref: 1,
  displayRef: 'ABS-1',
  title: 'On the nature of aqueducts',
  trackName: 'Engineering',
  formatName: 'Oration',
  level: 'intermediate',
  status: 'pending',
  comment: null,
  completedAt: null,
  submitterName: 'Vitruvius',
  average: null,
  scoredCount: 0,
  ...over,
});

const QUEUE = {
  round: { id: 'round-1' },
  rounds: [
    { id: 'round-1', name: 'First hearing', status: 'open', blindUntilClose: true, anonymized: false },
    { id: 'round-2', name: 'Second hearing', status: 'draft', blindUntilClose: false, anonymized: true },
  ],
  criteria: [{ id: 'relevance' }, { id: 'originality' }],
  assignments: [row({ submissionId: 'submission-1' })],
  recused: [row({ submissionId: 'submission-9', status: 'declined' })],
  authorHidden: true,
  pendingCount: 3,
  completedCount: 2,
};

const render = (round?: string) =>
  ReviewQueuePage({ searchParams: Promise.resolve(round ? { round } : {}) });

beforeEach(() => {
  reviewerSession.mockReset().mockResolvedValue(SESSION);
  currentActor.mockReset().mockResolvedValue(ACTOR);
  loadReviewerQueue.mockReset().mockResolvedValue(QUEUE);
});

describe('ReviewQueuePage', () => {
  it('sends a signed-out visitor to sign in and back again', async () => {
    reviewerSession.mockResolvedValue(null);
    currentActor.mockResolvedValue(null);

    await expect(render()).rejects.toThrow('redirect:/signin?next=/review');
  });

  it('sends a signed-in visitor who reviews nothing home rather than to sign-in', async () => {
    reviewerSession.mockResolvedValue(null);

    await expect(render()).rejects.toThrow('redirect:/');
  });

  it('passes the requested round through to the service', async () => {
    await render('round-2');

    expect(loadReviewerQueue).toHaveBeenCalledWith(SESSION.ctx, 'round-2');
  });

  it('asks for the default round when the URL names none', async () => {
    await render();

    expect(loadReviewerQueue).toHaveBeenCalledWith(SESSION.ctx, null);
  });

  it('hands the dashboard the queue as wire rows', async () => {
    const element = await render();
    const props = element.props as {
      eventName: string;
      round: RoundWire | null;
      rounds: RoundWire[];
      assignments: AssignmentWire[];
      recused: AssignmentWire[];
      authorHidden: boolean;
      criterionCount: number;
      pendingCount: number;
      completedCount: number;
    };

    expect(props.eventName).toBe('The Forum');
    expect(props.round?.id).toBe('round-1');
    expect(props.rounds.map((round) => round.id)).toEqual(['round-1', 'round-2']);
    expect(props.criterionCount).toBe(2);
    expect(props.authorHidden).toBe(true);
    expect(props.pendingCount).toBe(3);
    expect(props.completedCount).toBe(2);
    expect(props.recused.map((entry) => entry.submissionId)).toEqual(['submission-9']);

    // The wire row is deliberately narrower than the service row: `ref`, `completedAt` and
    // `scoredCount` stay on the server.
    expect(props.assignments).toEqual([
      {
        assignmentId: 'assignment-submission-1',
        submissionId: 'submission-1',
        displayRef: 'ABS-1',
        title: 'On the nature of aqueducts',
        trackName: 'Engineering',
        formatName: 'Oration',
        level: 'intermediate',
        status: 'pending',
        comment: null,
        submitterName: 'Vitruvius',
        average: null,
      },
    ]);
  });

  it('leaves the selected round null when the queue resolves one the list does not carry', async () => {
    loadReviewerQueue.mockResolvedValue({ ...QUEUE, round: { id: 'round-missing' } });

    const element = await render();

    expect((element.props as { round: RoundWire | null }).round).toBeNull();
  });
});
