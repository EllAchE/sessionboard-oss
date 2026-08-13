import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventContext } from '../context';

/**
 * `C-2`. `decideSubmissions` is the only path that sets `accepted`, `waitlisted` or `declined`, so
 * it is the only place a speaker can be told. These cover the things that matter: each of the three
 * decisions mails, a re-decision on a status that did not move stays quiet, a reset says nothing,
 * and a refused send never costs the decision.
 */

const state = vi.hoisted(() => ({
  rows: [] as Array<{ id: string; status: string }>,
  updates: [] as Array<Record<string, unknown>>,
}));

const comms = vi.hoisted(() => ({
  loadCommsContext: vi.fn(),
  wrapInBranding: vi.fn(),
  sendDecisionNotice: vi.fn(),
  // The real map, because which decisions mail is read straight off it.
  DECISION_TEMPLATES: {
    accepted: 'submission.accepted',
    waitlisted: 'submission.waitlisted',
    declined: 'submission.declined',
  } as Record<string, string>,
}));

vi.mock('./comms', () => comms);

vi.mock('../../db/client', () => ({
  getDb: () => ({
    select: () => {
      const promise = Promise.resolve(state.rows);
      const query = {
        from: () => query,
        where: () => query,
        then: promise.then.bind(promise),
      };
      return query;
    },
    update: () => ({
      set: (values: Record<string, unknown>) => {
        state.updates.push(values);
        return { where: () => Promise.resolve(undefined) };
      },
    }),
  }),
}));

import { decideSubmissions } from './review';

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
  state.rows = [];
  state.updates = [];
  comms.sendDecisionNotice.mockResolvedValue({
    recipients: 1,
    sent: 1,
    failed: 0,
    sentEmail: 1,
    sentSms: 0,
    logIds: ['log-1'],
  });
});

describe('decideSubmissions decision notices', () => {
  it('mails the speaker when a submission is accepted', async () => {
    state.rows = [{ id: 'sub-1', status: 'under_review' }];

    const result = await decideSubmissions(organizer, ['sub-1'], 'accept');

    expect(comms.sendDecisionNotice).toHaveBeenCalledTimes(1);
    expect(comms.sendDecisionNotice).toHaveBeenCalledWith('sub-1');
    expect(result).toMatchObject({ updated: 1, notified: 1, notifyFailed: 0 });
    // The notice reads the row's own status, so it must run after the write.
    expect(state.updates[0]).toMatchObject({ status: 'accepted' });
  });

  it('mails the speaker when a submission is declined', async () => {
    state.rows = [{ id: 'sub-2', status: 'submitted' }];

    const result = await decideSubmissions(organizer, ['sub-2'], 'decline');

    expect(comms.sendDecisionNotice).toHaveBeenCalledWith('sub-2');
    expect(result.notified).toBe(1);
    expect(state.updates[0]).toMatchObject({ status: 'declined' });
  });

  it('mails the speaker when a submission is waitlisted', async () => {
    // A waitlist is the decision a speaker is most likely to be left guessing about.
    state.rows = [{ id: 'sub-3', status: 'under_review' }];

    const result = await decideSubmissions(organizer, ['sub-3'], 'waitlist');

    expect(comms.sendDecisionNotice).toHaveBeenCalledWith('sub-3');
    expect(result).toMatchObject({ updated: 1, notified: 1, notifyFailed: 0 });
    expect(state.updates[0]).toMatchObject({ status: 'waitlisted' });
  });

  it('does not re-mail a submission that was already waitlisted', async () => {
    // Same gate as accept and decline: only a status that actually moved is news.
    state.rows = [
      { id: 'sub-old', status: 'waitlisted' },
      { id: 'sub-new', status: 'submitted' },
    ];

    const result = await decideSubmissions(organizer, ['sub-old', 'sub-new'], 'waitlist');

    expect(comms.sendDecisionNotice).toHaveBeenCalledTimes(1);
    expect(comms.sendDecisionNotice).toHaveBeenCalledWith('sub-new');
    expect(result).toMatchObject({ updated: 2, notified: 1 });
  });

  it('does not re-mail a submission that was already accepted', async () => {
    // A re-decision is legal — nothing rejects it — but the speaker already has this news.
    state.rows = [
      { id: 'sub-old', status: 'accepted' },
      { id: 'sub-new', status: 'under_review' },
    ];

    const result = await decideSubmissions(organizer, ['sub-old', 'sub-new'], 'accept');

    expect(comms.sendDecisionNotice).toHaveBeenCalledTimes(1);
    expect(comms.sendDecisionNotice).toHaveBeenCalledWith('sub-new');
    expect(result.updated).toBe(2);
    expect(result.notified).toBe(1);
  });

  it('keeps the decision when the notice fails, and keeps sending the rest of the batch', async () => {
    state.rows = [
      { id: 'sub-1', status: 'submitted' },
      { id: 'sub-2', status: 'submitted' },
      { id: 'sub-3', status: 'submitted' },
    ];
    comms.sendDecisionNotice.mockImplementation(async (id: string) => {
      if (id === 'sub-2') throw new Error('SMTP refused the message');
      return { recipients: 1, sent: 1, failed: 0, sentEmail: 1, sentSms: 0, logIds: [] };
    });

    const result = await decideSubmissions(organizer, ['sub-1', 'sub-2', 'sub-3'], 'accept');

    // Best-effort: the failure is counted and reported, never thrown, and never rolls anything back.
    expect(result).toMatchObject({ updated: 3, notified: 2, notifyFailed: 1 });
    expect(comms.sendDecisionNotice).toHaveBeenCalledTimes(3);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({ status: 'accepted' });
  });

  it('sends nothing for a reset', async () => {
    // Taking a decision back is not news: `under_review` has no template, so nothing goes out.
    state.rows = [{ id: 'sub-1', status: 'accepted' }];

    const reset = await decideSubmissions(organizer, ['sub-1'], 'reset');

    expect(comms.sendDecisionNotice).not.toHaveBeenCalled();
    expect(reset).toMatchObject({ updated: 1, notified: 0, notifyFailed: 0 });
  });

  it('leaves a draft alone rather than deciding or mailing it', async () => {
    state.rows = [{ id: 'sub-draft', status: 'draft' }];

    const result = await decideSubmissions(organizer, ['sub-draft'], 'accept');

    expect(result.updated).toBe(0);
    expect(result.skipped).toHaveLength(1);
    expect(state.updates).toHaveLength(0);
    expect(comms.sendDecisionNotice).not.toHaveBeenCalled();
  });
});
