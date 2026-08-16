import { beforeEach, describe, expect, it, vi } from 'vitest';
import { forbidden } from '../../../../lib/errors';

/**
 * The action boundary, because that is where the vulnerability lived: `inviteReviewer` binds to an
 * existing account when one already holds the address, so returning the link on a failed send
 * handed the organizer a session as that person. These assert the link is decided by
 * `magicLinkMayBeShown` and by nothing else.
 */

const mocks = vi.hoisted(() => ({
  decideContext: vi.fn(),
  inviteReviewer: vi.fn(),
  magicLinkMayBeShown: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../context', () => ({ decideContext: mocks.decideContext }));
vi.mock('../../../../lib/services/review', () => ({ inviteReviewer: mocks.inviteReviewer }));
vi.mock('../../../../lib/auth', () => ({ magicLinkMayBeShown: mocks.magicLinkMayBeShown }));

const { inviteReviewerAction } = await import('./actions');

const LINK = 'https://cicero.test/auth/verify?token=one-time-secret';

const reviewer = {
  userId: 'user-1',
  name: 'Victim Organizer',
  email: 'victim@real-conference.com',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.decideContext.mockResolvedValue({
    actor: { userId: 'organizer-1', email: 'chair@acme.test', name: 'Chair', impersonatedByUserId: null },
    eventId: 'event-1',
    roles: ['organizer'],
  });
});

function invited(delivered: boolean) {
  mocks.inviteReviewer.mockResolvedValue({ reviewer, link: LINK, delivered });
}

describe('inviteReviewerAction', () => {
  it('reveals nothing when the send fails and the address is not one the demo policy allows', async () => {
    invited(false);
    mocks.magicLinkMayBeShown.mockResolvedValue(null);

    const result = await inviteReviewerAction({ email: reviewer.email });

    expect(result).toEqual({
      ok: true,
      data: { reviewer, accessLink: null, delivery: 'undelivered' },
    });
    expect(JSON.stringify(result)).not.toContain('one-time-secret');
  });

  it('reveals nothing on a successful send either', async () => {
    invited(true);
    mocks.magicLinkMayBeShown.mockResolvedValue(null);

    const result = await inviteReviewerAction({ email: reviewer.email });

    expect(result).toMatchObject({ ok: true, data: { accessLink: null, delivery: 'email' } });
  });

  it('asks the shared predicate about the invitee, not about the organizer or the transport', async () => {
    invited(false);
    mocks.magicLinkMayBeShown.mockResolvedValue(null);

    await inviteReviewerAction({ email: '  Victim@Real-Conference.com ' });

    expect(mocks.magicLinkMayBeShown).toHaveBeenCalledWith(reviewer.email);
  });

  it('still shows the link on an instance that delivers nothing to anybody', async () => {
    invited(true);
    mocks.magicLinkMayBeShown.mockResolvedValue('instance-delivers-nothing');

    const result = await inviteReviewerAction({ email: 'reviewer@example.com' });

    expect(result).toMatchObject({ ok: true, data: { accessLink: LINK, delivery: 'logged' } });
  });

  it('still shows the link for a seeded demo identity under a real transport', async () => {
    invited(true);
    mocks.magicLinkMayBeShown.mockResolvedValue('seeded-demo-account');

    const result = await inviteReviewerAction({ email: 'organizer@example.com' });

    expect(result).toMatchObject({ ok: true, data: { accessLink: LINK, delivery: 'demo' } });
  });

  it('does not reach the visibility predicate at all when the invite itself is refused', async () => {
    mocks.inviteReviewer.mockRejectedValue(forbidden('Only organizers can do that'));

    const result = await inviteReviewerAction({ email: reviewer.email });

    expect(result.ok).toBe(false);
    expect(mocks.magicLinkMayBeShown).not.toHaveBeenCalled();
  });
});
