import { describe, expect, it } from 'vitest';
import {
  assignmentMembershipChanges,
  resolveAssignmentTargets,
  type AssignmentTarget,
  type ScopeResolution,
  type SpeakingRole,
} from './tasks';

/**
 * `S-16`. Task scoping is tested as a pure function because the thing that was wrong with it was
 * never visible on screen. "A speaker with two accepted sessions gets one assignment attached to an
 * arbitrary one" renders identically to the correct answer — one task card — and only a count tells
 * the two apart.
 *
 * The cast below is one panel and one solo talk, deliberately overlapping: Ada is on both, which is
 * the case every scope has to answer differently.
 */

const ADA = 'participant-ada';
const GRACE = 'participant-grace';
const MARGARET = 'participant-margaret';
const LURKER = 'participant-lurker';

const PANEL = 'submission-panel';
const SOLO = 'submission-solo';
const REJECTED = 'submission-rejected';

const PEOPLE = [ADA, GRACE, MARGARET, LURKER];

const ROLES: SpeakingRole[] = [
  { participantId: GRACE, submissionId: PANEL, accepted: true, isPrimary: true, position: 0 },
  { participantId: ADA, submissionId: PANEL, accepted: true, isPrimary: false, position: 1 },
  { participantId: MARGARET, submissionId: PANEL, accepted: true, isPrimary: false, position: 2 },
  { participantId: ADA, submissionId: SOLO, accepted: true, isPrimary: true, position: 0 },
  { participantId: MARGARET, submissionId: REJECTED, accepted: false, isPrimary: true, position: 0 },
];

function resolve(patch: Partial<ScopeResolution> = {}): AssignmentTarget[] {
  return resolveAssignmentTargets({
    scope: 'contact',
    audience: 'accepted_participants',
    pinnedSubmissionId: null,
    selectedParticipantIds: [],
    participantIds: PEOPLE,
    roles: ROLES,
    ...patch,
  });
}

const sorted = (targets: AssignmentTarget[]) =>
  [...targets]
    .map((row) => `${row.participantId}/${row.submissionId ?? '-'}`)
    .sort((a, b) => a.localeCompare(b));

describe('contact scope', () => {
  it('gives each person exactly one row, whatever they are speaking on', () => {
    const targets = resolve({ scope: 'contact', audience: 'all_participants' });
    expect(sorted(targets)).toEqual([
      `${ADA}/-`,
      `${GRACE}/-`,
      `${LURKER}/-`,
      `${MARGARET}/-`,
    ]);
  });

  /**
   * The bug this whole change exists to fix. Before scoping, every non-manual assignment was
   * stamped with the participant's *first* accepted submission, so a contact-level task carried a
   * session it was never about — and `reconcileAssignments` then treated that arbitrary pointer as
   * part of the row's identity.
   */
  it('never attaches a session to a row that is about the person', () => {
    const targets = resolve({ scope: 'contact', audience: 'accepted_participants' });
    expect(targets.every((row) => row.submissionId === null)).toBe(true);
  });

  it('leaves out anyone with nothing accepted when the audience says accepted only', () => {
    const targets = resolve({ scope: 'contact' });
    expect(sorted(targets)).toEqual([`${ADA}/-`, `${GRACE}/-`, `${MARGARET}/-`]);
  });
});

describe('submission scope', () => {
  it('gives a speaker one row per accepted session rather than one row overall', () => {
    const targets = resolve({ scope: 'submission' });
    expect(sorted(targets)).toEqual([
      `${ADA}/${PANEL}`,
      `${ADA}/${SOLO}`,
      `${GRACE}/${PANEL}`,
      `${MARGARET}/${PANEL}`,
    ]);
  });

  it('does not count a session that was not accepted', () => {
    const targets = resolve({ scope: 'submission', audience: 'all_participants' });
    expect(targets.some((row) => row.submissionId === REJECTED)).toBe(false);
  });

  it('produces nothing for a participant who speaks on nothing', () => {
    const targets = resolve({ scope: 'submission', audience: 'all_participants' });
    expect(targets.some((row) => row.participantId === LURKER)).toBe(false);
  });
});

describe('group scope', () => {
  it('produces one shared row per session, not one per speaker', () => {
    const targets = resolve({ scope: 'group' });
    expect(targets).toHaveLength(2);
    expect(targets.map((row) => row.submissionId).sort()).toEqual([PANEL, SOLO].sort());
  });

  /**
   * The holder has to be a total order, not whatever the query returned first. `reconcileAssignments`
   * diffs on `(participant, session)`, so a holder that moved between two saves would look like a
   * removal plus an addition — deleting the team's completed answer and writing a blank one back.
   */
  it('hands the row to the primary speaker, deterministically', () => {
    const first = resolve({ scope: 'group' });
    const shuffled = resolveAssignmentTargets({
      scope: 'group',
      audience: 'accepted_participants',
      pinnedSubmissionId: null,
      selectedParticipantIds: [],
      participantIds: [...PEOPLE].reverse(),
      roles: [...ROLES].reverse(),
    });
    expect(first).toEqual(shuffled);
    expect(first.find((row) => row.submissionId === PANEL)?.participantId).toBe(GRACE);
    expect(first.find((row) => row.submissionId === SOLO)?.participantId).toBe(ADA);
  });
});

describe('pinning a task to one session', () => {
  it('narrows a per-session task to that session alone', () => {
    const targets = resolve({ scope: 'submission', pinnedSubmissionId: PANEL });
    expect(sorted(targets)).toEqual([
      `${ADA}/${PANEL}`,
      `${GRACE}/${PANEL}`,
      `${MARGARET}/${PANEL}`,
    ]);
  });

  /**
   * A pin narrows the *people* as well as the sessions. "Everyone in the event" plus "this is about
   * SESS-4" cannot sensibly mean the whole roster owes something about a talk they are not on.
   */
  it('excludes people who are not on the pinned session, whatever the audience says', () => {
    const targets = resolve({
      scope: 'submission',
      audience: 'all_participants',
      pinnedSubmissionId: SOLO,
    });
    expect(sorted(targets)).toEqual([`${ADA}/${SOLO}`]);
  });

  it('honours a pin to a session that has not been accepted', () => {
    const targets = resolve({
      scope: 'group',
      audience: 'all_participants',
      pinnedSubmissionId: REJECTED,
    });
    expect(sorted(targets)).toEqual([`${MARGARET}/${REJECTED}`]);
  });

  it('still respects a manual audience, intersecting the two', () => {
    const targets = resolve({
      scope: 'submission',
      audience: 'manual',
      selectedParticipantIds: [ADA, LURKER],
      pinnedSubmissionId: PANEL,
    });
    expect(sorted(targets)).toEqual([`${ADA}/${PANEL}`]);
  });
});

describe('participants outside the event', () => {
  it('drops a selected id that is not on the roster instead of assigning it', () => {
    const targets = resolve({
      scope: 'contact',
      audience: 'manual',
      selectedParticipantIds: [ADA, 'participant-from-another-event'],
    });
    expect(sorted(targets)).toEqual([`${ADA}/-`]);
  });
});

/**
 * `S-16` widened the assignment key from `(task, participant)` to `(task, participant, session)`.
 * The diff that reconciles a task's rows against its targets had to widen with it: keyed on the
 * participant alone, a speaker's second session looked like the same row moving, and one of the two
 * answers was thrown away on every save.
 */
describe('assignmentMembershipChanges', () => {
  const existing = [
    { id: 'a1', participantId: ADA, submissionId: PANEL, scope: 'submission' as const },
    { id: 'a2', participantId: ADA, submissionId: SOLO, scope: 'submission' as const },
    { id: 'a3', participantId: GRACE, submissionId: PANEL, scope: 'submission' as const },
  ];

  it('keeps both of one speaker’s per-session rows rather than collapsing them', () => {
    const { removeIds, additions, updates } = assignmentMembershipChanges(existing, [
      { participantId: ADA, submissionId: PANEL, scope: 'submission' },
      { participantId: ADA, submissionId: SOLO, scope: 'submission' },
      { participantId: GRACE, submissionId: PANEL, scope: 'submission' },
    ]);
    expect(removeIds).toEqual([]);
    expect(additions).toEqual([]);
    expect(updates).toEqual([]);
  });

  it('adds the row for a newly accepted session without touching the existing one', () => {
    const { removeIds, additions } = assignmentMembershipChanges(existing, [
      ...existing.map(({ participantId, submissionId }) => ({
        participantId,
        submissionId,
        scope: 'submission' as const,
      })),
      { participantId: MARGARET, submissionId: PANEL, scope: 'submission' },
    ]);
    expect(removeIds).toEqual([]);
    expect(additions).toEqual([
      { participantId: MARGARET, submissionId: PANEL, scope: 'submission' },
    ]);
  });

  it('drops only the rows whose session is no longer in play', () => {
    const { removeIds, additions } = assignmentMembershipChanges(existing, [
      { participantId: ADA, submissionId: PANEL, scope: 'submission' },
      { participantId: GRACE, submissionId: PANEL, scope: 'submission' },
    ]);
    expect(removeIds).toEqual(['a2']);
    expect(additions).toEqual([]);
  });

  /**
   * Switching a task from per-session to per-group keeps the primary speaker's row — with its
   * status, its uploaded files and its answers — and only rewrites the denormalised scope.
   */
  it('rewrites the scope in place when the row itself survives', () => {
    const { removeIds, additions, updates } = assignmentMembershipChanges(existing, [
      { participantId: ADA, submissionId: SOLO, scope: 'group' },
      { participantId: GRACE, submissionId: PANEL, scope: 'group' },
    ]);
    expect(removeIds).toEqual(['a1']);
    expect(additions).toEqual([]);
    expect(updates).toEqual([
      { id: 'a2', scope: 'group' },
      { id: 'a3', scope: 'group' },
    ]);
  });

  /**
   * A contact-scoped row carries no session, and the key has to tell that apart from a row about a
   * session — otherwise moving a task to per-session would silently reuse the person's old row.
   */
  it('treats a row with no session as a different row from one with a session', () => {
    const { removeIds, additions } = assignmentMembershipChanges(
      [{ id: 'c1', participantId: ADA, submissionId: null, scope: 'contact' }],
      [{ participantId: ADA, submissionId: SOLO, scope: 'submission' }],
    );
    expect(removeIds).toEqual(['c1']);
    expect(additions).toEqual([{ participantId: ADA, submissionId: SOLO, scope: 'submission' }]);
  });
});
