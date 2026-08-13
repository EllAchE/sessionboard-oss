import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '@/lib/context';
import type { SubmissionReview } from '@/lib/services/review';
import type { ReviewerSession } from '../context';

/**
 * The scorecard route. Its own decisions are the ones covered here: an unassigned petition is a 404
 * rather than a 403, and the prev/next/position footer is derived from the queue order rather than
 * from the submission itself.
 */

(globalThis as typeof globalThis & { React: typeof React }).React = React;

class RedirectError extends Error {
  constructor(readonly to: string) {
    super(`redirect:${to}`);
  }
}

class NotFoundError extends Error {
  constructor() {
    super('not-found');
  }
}

const reviewerSession = vi.fn<() => Promise<ReviewerSession | null>>();
const currentActor = vi.fn<() => Promise<Actor | null>>();
const loadAssignedReview = vi.fn();
const loadReviewerQueue = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new RedirectError(to);
  },
  notFound: () => {
    throw new NotFoundError();
  },
}));

vi.mock('@/lib/auth', () => ({ currentActor: () => currentActor() }));
vi.mock('../context', () => ({ reviewerSession: () => reviewerSession() }));
vi.mock('@/lib/services/review', () => ({
  loadAssignedReview: (...args: unknown[]) => loadAssignedReview(...args),
  loadReviewerQueue: (...args: unknown[]) => loadReviewerQueue(...args),
}));

const ReviewerSubmissionPage = (await import('./page')).default;

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

const ROUND = {
  id: 'round-1',
  name: 'First hearing',
  status: 'open',
  blindUntilClose: true,
  anonymized: false,
};

const detail = (over: Partial<SubmissionReview> = {}) =>
  ({
    id: 'submission-2',
    ref: 2,
    displayRef: 'ABS-2',
    title: 'On the nature of aqueducts',
    descriptionMarkdown: null,
    status: 'under_review',
    level: null,
    trackName: null,
    formatName: null,
    tags: [],
    answers: {},
    answerLabels: {},
    submittedAt: null,
    decidedAt: null,
    decisionNote: null,
    submitterName: 'Vitruvius',
    submitterEmail: 'vitruvius@forum.example',
    speakers: [],
    round: ROUND,
    criteria: [],
    reviewers: [],
    blinded: false,
    authorHidden: false,
    myAssignmentStatus: 'pending',
    summary: {},
    myScores: [],
    myComment: null,
    myAssignmentId: 'assignment-2',
    ai: null,
    ...over,
  }) as unknown as SubmissionReview;

const queueOf = (...submissionIds: string[]) => ({
  assignments: submissionIds.map((submissionId) => ({ submissionId })),
});

const render = (submissionId = 'submission-2', round?: string) =>
  ReviewerSubmissionPage({
    params: Promise.resolve({ submissionId }),
    searchParams: Promise.resolve(round ? { round } : {}),
  });

type FooterProps = {
  prevHref: string | null;
  nextHref: string | null;
  position: number | null;
  total: number;
  peerCount: number;
};

beforeEach(() => {
  reviewerSession.mockReset().mockResolvedValue(SESSION);
  currentActor.mockReset().mockResolvedValue(ACTOR);
  loadAssignedReview.mockReset().mockResolvedValue(detail());
  loadReviewerQueue
    .mockReset()
    .mockResolvedValue(queueOf('submission-1', 'submission-2', 'submission-3'));
});

describe('ReviewerSubmissionPage', () => {
  it('sends a signed-out visitor to sign in and back again', async () => {
    reviewerSession.mockResolvedValue(null);
    currentActor.mockResolvedValue(null);

    await expect(render()).rejects.toThrow('redirect:/signin?next=/review');
  });

  it('treats a petition that is not theirs as absent rather than forbidden', async () => {
    // Answering 403 would confirm the submission exists to someone with no claim on it.
    loadAssignedReview.mockRejectedValue(new Error('not assigned'));

    await expect(render()).rejects.toBeInstanceOf(NotFoundError);
  });

  it('reads the queue for the round the petition belongs to, not the URL', async () => {
    await render('submission-2', 'round-stale');

    expect(loadAssignedReview).toHaveBeenCalledWith(SESSION.ctx, 'submission-2', 'round-stale');
    expect(loadReviewerQueue).toHaveBeenCalledWith(SESSION.ctx, 'round-1');
  });

  it('walks to the neighbouring petitions and keeps the round on both links', async () => {
    const props = (await render()).props as FooterProps;

    expect(props.prevHref).toBe('/review/submission-1?round=round-1');
    expect(props.nextHref).toBe('/review/submission-3?round=round-1');
    expect(props.position).toBe(2);
    expect(props.total).toBe(3);
  });

  it('stops at each end of the queue', async () => {
    loadAssignedReview.mockResolvedValue(detail({ id: 'submission-1' }));
    const first = (await render('submission-1')).props as FooterProps;
    expect(first.prevHref).toBeNull();
    expect(first.nextHref).toBe('/review/submission-2?round=round-1');

    loadAssignedReview.mockResolvedValue(detail({ id: 'submission-3' }));
    const last = (await render('submission-3')).props as FooterProps;
    expect(last.prevHref).toBe('/review/submission-2?round=round-1');
    expect(last.nextHref).toBeNull();
  });

  it('offers no position when the petition sits outside the current queue', async () => {
    loadReviewerQueue.mockResolvedValue(queueOf('submission-7', 'submission-8'));

    const props = (await render()).props as FooterProps;

    expect(props.position).toBeNull();
    expect(props.prevHref).toBeNull();
    expect(props.nextHref).toBeNull();
  });

  it('counts peers without counting the reviewer themselves', async () => {
    loadAssignedReview.mockResolvedValue(
      detail({
        reviewers: [
          { reviewerUserId: ACTOR.userId },
          { reviewerUserId: 'reviewer-brutus' },
          { reviewerUserId: 'reviewer-cassius' },
        ],
      } as Partial<SubmissionReview>),
    );

    expect(((await render()).props as FooterProps).peerCount).toBe(2);
  });
});
