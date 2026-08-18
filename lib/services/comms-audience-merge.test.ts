import { describe, expect, it } from 'vitest';
import {
  mergeSubmission,
  qualifyingSubmissions,
  type AudienceSpec,
  type RecipientSubmission,
} from './comms';

/**
 * `CMS-S2`. A speaker with an accepted talk and a declined one is legitimately in both the
 * "Accepted speakers" and the "Declined speakers" audience. Compose built `{{submission.title}}`
 * from `submissions.find(accepted) ?? submissions[0]`, which is blind to the audience being sent
 * to — so the declined mailing told him his accepted talk had not made it in.
 *
 * These are the rules behind the pick. The bug was never in the audience filter, which was right
 * about who to write to; it was that the answer to "which talk is this email about" was thrown away
 * between filtering and merging.
 */
function proposal(over: Partial<RecipientSubmission> & { ref: number }): RecipientSubmission {
  return {
    id: `sub-${over.ref}`,
    title: `Proposal ${over.ref}`,
    status: 'submitted',
    trackId: null,
    formatId: null,
    decisionNote: null,
    ...over,
  };
}

const ACCEPTED = proposal({ ref: 1, status: 'accepted', title: 'Taming 40-Minute CI' });
const DECLINED = proposal({ ref: 2, status: 'declined', title: 'Rewriting the Monolith' });
const BOTH = [ACCEPTED, DECLINED];

const nothingScheduled = () => false;
const spec = (kind: AudienceSpec['kind'], rest: Partial<AudienceSpec> = {}): AudienceSpec => ({
  kind,
  ...rest,
});

describe('mergeSubmission', () => {
  /** The reported defect, in one assertion. */
  it('names the declined talk in a declined-speakers send', () => {
    expect(mergeSubmission(spec('declined_speakers'), BOTH, nothingScheduled)?.title).toBe(
      'Rewriting the Monolith',
    );
  });

  it('names the accepted talk in an accepted-speakers send to the same person', () => {
    expect(mergeSubmission(spec('accepted_speakers'), BOTH, nothingScheduled)?.title).toBe(
      'Taming 40-Minute CI',
    );
  });

  it('treats a waitlist as still awaiting a decision', () => {
    const waitlisted = proposal({ ref: 3, status: 'waitlisted' });

    expect(
      mergeSubmission(spec('pending_speakers'), [ACCEPTED, waitlisted], nothingScheduled)?.ref,
    ).toBe(3);
  });

  it('names the talk in the track being written to, not the accepted one elsewhere', () => {
    const platform = proposal({ ref: 4, trackId: 'trk-platform' });

    expect(
      mergeSubmission(spec('track', { trackId: 'trk-platform' }), [ACCEPTED, platform], nothingScheduled)
        ?.ref,
    ).toBe(4);
  });

  it('names the talk in the format being written to', () => {
    const workshop = proposal({ ref: 5, formatId: 'fmt-workshop' });

    expect(
      mergeSubmission(
        spec('format', { formatId: 'fmt-workshop' }),
        [ACCEPTED, workshop],
        nothingScheduled,
      )?.ref,
    ).toBe(5);
  });

  it('names the scheduled talk in a scheduled-speakers send', () => {
    const scheduled = proposal({ ref: 6, status: 'accepted' });

    expect(
      mergeSubmission(spec('scheduled_speakers'), [ACCEPTED, scheduled], (id) => id === 'sub-6')
        ?.ref,
    ).toBe(6);
  });

  /**
   * The audiences that are not about any one submission keep the pick they had. A hand-picked send
   * is also how every triggered notification resolves its recipient, and those were already naming
   * the right talk.
   */
  it('still prefers the accepted talk when the audience is not about a submission', () => {
    for (const kind of ['all_speakers', 'manual', 'outstanding_tasks'] as const) {
      expect(mergeSubmission(spec(kind), BOTH, nothingScheduled)?.title).toBe(
        'Taming 40-Minute CI',
      );
    }
  });

  /**
   * Two talks with the same standing in the same segment. Whichever order the rows arrive in, the
   * same one is named — a mailing that is resent should not change its subject.
   */
  it('picks the same talk regardless of the order the rows arrive in', () => {
    const older = proposal({ ref: 7, status: 'declined' });
    const newer = proposal({ ref: 8, status: 'declined' });

    expect(mergeSubmission(spec('declined_speakers'), [newer, older], nothingScheduled)?.ref).toBe(7);
    expect(mergeSubmission(spec('declined_speakers'), [older, newer], nothingScheduled)?.ref).toBe(7);
  });

  it('returns nothing for a recipient with no submissions', () => {
    expect(mergeSubmission(spec('manual'), [], nothingScheduled)).toBeNull();
  });
});

describe('qualifyingSubmissions', () => {
  /** Non-empty is what puts the recipient in the audience, so this decides who is written to. */
  it('is empty when nothing of theirs matches, which is what keeps them out', () => {
    expect(qualifyingSubmissions(spec('declined_speakers'), [ACCEPTED], nothingScheduled)).toEqual(
      [],
    );
  });

  it('returns every qualifying submission, not only the first', () => {
    const second = proposal({ ref: 9, status: 'declined' });

    expect(
      qualifyingSubmissions(spec('declined_speakers'), [ACCEPTED, DECLINED, second], nothingScheduled),
    ).toHaveLength(2);
  });

  it('leaves a hand-picked recipient every submission they have', () => {
    expect(qualifyingSubmissions(spec('manual'), BOTH, nothingScheduled)).toHaveLength(2);
  });

  it('does not put an untracked submission in a track audience', () => {
    expect(
      qualifyingSubmissions(spec('track', { trackId: 'trk-platform' }), BOTH, nothingScheduled),
    ).toEqual([]);
  });
});
