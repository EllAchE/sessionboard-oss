import { beforeEach, describe, expect, it, vi } from 'vitest';
import { forbidden } from '@/lib/errors';
import type { EventContext } from '@/lib/context';
import type { ReviewerSession } from './context';

/**
 * The two reviewer writes. The service owns the policy, so what is worth pinning here is the shell
 * around it: the auth gate, and the promise that a thrown error becomes a rendered message rather
 * than an unhandled Server Action rejection.
 */

const reviewerSession = vi.fn<() => Promise<ReviewerSession | null>>();
const saveScorecard = vi.fn();
const declineAssignment = vi.fn();
const revalidatePath = vi.fn();

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

vi.mock('./context', () => ({
  reviewerSession: () => reviewerSession(),
}));

vi.mock('@/lib/services/review', () => ({
  saveScorecard: (...args: unknown[]) => saveScorecard(...args),
  declineAssignment: (...args: unknown[]) => declineAssignment(...args),
}));

const { saveMyScorecardAction, recuseAction } = await import('./actions');

const CTX: EventContext = {
  actor: {
    userId: 'user-cicero',
    email: 'cicero@forum.example',
    name: 'Marcus Tullius Cicero',
    impersonatedByUserId: null,
  },
  eventId: 'event-forum',
  roles: ['reviewer'],
};

const SESSION = { ctx: CTX, event: { id: 'event-forum' }, canDecide: false } as ReviewerSession;

const INPUT = {
  roundId: 'round-1',
  submissionId: 'submission-1',
  scores: [{ criterionId: 'relevance', value: 4 }],
  comment: 'Worthy of the Forum.',
  complete: true,
};

beforeEach(() => {
  reviewerSession.mockReset().mockResolvedValue(SESSION);
  saveScorecard.mockReset().mockResolvedValue({ aggregate: { average: 4.25, complete: true } });
  declineAssignment.mockReset().mockResolvedValue(undefined);
  revalidatePath.mockReset();
});

describe('saveMyScorecardAction', () => {
  it('returns the aggregate the reviewer should see and refreshes the queue', async () => {
    const result = await saveMyScorecardAction(INPUT);

    expect(result).toEqual({ ok: true, data: { average: 4.25, complete: true } });
    expect(saveScorecard).toHaveBeenCalledWith(CTX, INPUT);
    expect(revalidatePath).toHaveBeenCalledWith('/review', 'layout');
  });

  it('turns away a visitor with no reviewer session before reaching the service', async () => {
    reviewerSession.mockResolvedValue(null);

    expect(await saveMyScorecardAction(INPUT)).toEqual({
      ok: false,
      message: 'Sign in as a reviewer to continue',
    });
    expect(saveScorecard).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('surfaces a service refusal in its own words', async () => {
    saveScorecard.mockRejectedValue(forbidden('That petition is not assigned to you'));

    expect(await saveMyScorecardAction(INPUT)).toEqual({
      ok: false,
      message: 'That petition is not assigned to you',
    });
  });

  it('hides an unexpected failure behind a generic message', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    saveScorecard.mockRejectedValue(new Error('connection terminated unexpectedly'));

    const result = await saveMyScorecardAction(INPUT);

    expect(result).toEqual({ ok: false, message: 'Something went wrong. Try again.' });
    // The property that matters regardless of how the copy is worded next.
    expect(JSON.stringify(result)).not.toContain('connection terminated');
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe('recuseAction', () => {
  it('passes the stated reason through to the service', async () => {
    expect(await recuseAction('assignment-1', 'I advise this speaker')).toEqual({
      ok: true,
      data: null,
    });
    expect(declineAssignment).toHaveBeenCalledWith(CTX, 'assignment-1', 'I advise this speaker');
  });

  it('normalises an omitted reason to null rather than undefined', async () => {
    await recuseAction('assignment-1');

    expect(declineAssignment).toHaveBeenCalledWith(CTX, 'assignment-1', null);
  });
});
