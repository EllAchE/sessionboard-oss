import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventContext } from '../context';
import { inviteReviewer } from './review';

const auth = vi.hoisted(() => ({
  ensureUserAccount: vi.fn(),
  grantRole: vi.fn(),
  requestMagicLink: vi.fn(),
}));

vi.mock('../auth', () => auth);

const organizer: EventContext = {
  actor: {
    userId: 'organizer-1',
    email: 'chair@example.test',
    name: 'Chair',
    impersonatedByUserId: null,
  },
  eventId: 'event-1',
  roles: ['organizer'],
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.ensureUserAccount.mockResolvedValue({
    id: 'reviewer-1',
    email: 'reviewer@example.test',
    name: 'Reviewer One',
  });
  auth.grantRole.mockResolvedValue(undefined);
  auth.requestMagicLink.mockResolvedValue({
    email: 'reviewer@example.test',
    link: 'https://cicero.test/auth/verify?token=one-time',
    delivered: true,
  });
});

describe('inviteReviewer', () => {
  it('grants event-scoped reviewer access before issuing the review-portal link', async () => {
    const result = await inviteReviewer(organizer, {
      email: ' reviewer@example.test ',
      name: ' Reviewer One ',
    });

    expect(auth.ensureUserAccount).toHaveBeenCalledWith(
      ' reviewer@example.test ',
      'Reviewer One',
    );
    expect(auth.grantRole).toHaveBeenCalledWith('reviewer-1', 'event-1', 'reviewer');
    expect(auth.requestMagicLink).toHaveBeenCalledWith({
      email: 'reviewer@example.test',
      name: 'Reviewer One',
      eventId: 'event-1',
      redirectTo: '/review',
    });
    expect(auth.grantRole.mock.invocationCallOrder[0]).toBeLessThan(
      auth.requestMagicLink.mock.invocationCallOrder[0],
    );
    expect(result).toEqual({
      reviewer: {
        userId: 'reviewer-1',
        name: 'Reviewer One',
        email: 'reviewer@example.test',
      },
      link: 'https://cicero.test/auth/verify?token=one-time',
      delivered: true,
    });
  });

  it('refuses non-organizers before creating or inviting an account', async () => {
    const reviewer = { ...organizer, roles: ['reviewer'] as EventContext['roles'] };

    await expect(inviteReviewer(reviewer, { email: 'peer@example.test' })).rejects.toMatchObject({
      code: 'forbidden',
    });
    expect(auth.ensureUserAccount).not.toHaveBeenCalled();
    expect(auth.grantRole).not.toHaveBeenCalled();
    expect(auth.requestMagicLink).not.toHaveBeenCalled();
  });
});
