import { describe, expect, it } from 'vitest';
import { describeHold, publicHolds, withholdsSession } from './public-visibility';

const CONFIRMED = { name: 'Priya Raman', workflowStatus: 'confirmed' as const };
const INVITED = { name: 'Marcus Okafor', workflowStatus: 'invited' as const };

describe('publicHolds', () => {
  it('holds nothing back for a published session everything has cleared', () => {
    expect(
      publicHolds({
        status: 'published',
        contentStatus: 'approved',
        speakers: [CONFIRMED],
      }),
    ).toEqual([]);
  });

  it('says nothing about a draft, which is withheld on purpose', () => {
    expect(
      publicHolds({ status: 'draft', contentStatus: 'in_review', speakers: [INVITED] }),
    ).toEqual([]);
  });

  /** The run's own case: published on both days, and one session never reached the public agenda. */
  it('reports copy still in review as withholding the whole session', () => {
    const holds = publicHolds({
      status: 'published',
      contentStatus: 'in_review',
      speakers: [CONFIRMED],
    });

    expect(holds).toEqual([{ kind: 'content_status', status: 'in_review' }]);
    expect(withholdsSession(holds)).toBe(true);
  });

  it('reports changes requested the same way', () => {
    expect(
      withholdsSession(
        publicHolds({
          status: 'published',
          contentStatus: 'changes_requested',
          speakers: [],
        }),
      ),
    ).toBe(true);
  });

  it('names an unconfirmed speaker without claiming the session is hidden', () => {
    const holds = publicHolds({
      status: 'published',
      contentStatus: 'approved',
      speakers: [CONFIRMED, INVITED],
    });

    expect(holds).toEqual([{ kind: 'unconfirmed_speakers', names: ['Marcus Okafor'] }]);
    expect(withholdsSession(holds)).toBe(false);
  });

  it('reports both when both apply', () => {
    expect(
      publicHolds({
        status: 'published',
        contentStatus: 'in_review',
        speakers: [INVITED],
      }).map((hold) => hold.kind),
    ).toEqual(['content_status', 'unconfirmed_speakers']);
  });

  /** A keynote typed straight into the grid has no submission, so no approval gates it. */
  it('leaves a session with no submission behind it alone', () => {
    expect(
      publicHolds({ status: 'published', contentStatus: null, speakers: [] }),
    ).toEqual([]);
  });
});

describe('describeHold', () => {
  it('points at the page that clears an approval hold', () => {
    expect(describeHold({ kind: 'content_status', status: 'in_review' })).toContain('Content');
    expect(describeHold({ kind: 'content_status', status: 'changes_requested' })).toContain(
      'changes requested',
    );
  });

  it('agrees with itself about one, two and many speakers', () => {
    expect(describeHold({ kind: 'unconfirmed_speakers', names: ['Ada'] })).toContain('Ada is left');
    expect(describeHold({ kind: 'unconfirmed_speakers', names: ['Ada', 'Grace'] })).toContain(
      'Ada and Grace are left',
    );
    expect(
      describeHold({ kind: 'unconfirmed_speakers', names: ['Ada', 'Grace', 'Barbara'] }),
    ).toContain('Ada and 2 others are left');
  });
});
