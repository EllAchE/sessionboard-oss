import { describe, expect, it } from 'vitest';
import { PARTICIPANT_BUILTIN_META, type ParticipantRoleSpec } from '../forms/contract';
import type { AppError } from '../errors';
import {
  buildParticipantSpecs,
  emptyParticipant,
  validateParticipants,
  type ParticipantInput,
} from './submissions';

/**
 * `F-6` and `F-7` where they meet: the participant stage's server-side gate. What matters is that the
 * field rules and the count rules are enforced *together* and reported per person — a stage that
 * shows three people and one unattributed error message is a stage nobody can fix.
 */

function fieldRow(key: string, overrides: Record<string, unknown> = {}) {
  const meta = PARTICIPANT_BUILTIN_META[key as keyof typeof PARTICIPANT_BUILTIN_META];
  return {
    id: `field-${key}`,
    position: 0,
    step: 0,
    type: meta.type,
    key,
    builtinKey: key,
    label: meta.label,
    helpText: null,
    placeholder: null,
    required: meta.required,
    options: null,
    showIf: null,
    minLength: null,
    maxLength: meta.maxLength,
    charLimitGroup: null,
    ...overrides,
  };
}

const allFields = buildParticipantSpecs([
  fieldRow('firstName', { position: 0 }),
  fieldRow('lastName', { position: 1 }),
  fieldRow('email', { position: 2 }),
  fieldRow('phone', { position: 3 }),
  fieldRow('biography', { position: 4 }),
]);

const roles: ParticipantRoleSpec[] = [
  { id: 'speaker', kind: 'speaker', label: 'Speaker', position: 0, minCount: 1, maxCount: 1 },
  { id: 'co_speaker', kind: 'co_speaker', label: 'Co-speaker', position: 1, minCount: 0, maxCount: 2 },
];

function person(overrides: Partial<ParticipantInput> = {}): ParticipantInput {
  return {
    ...emptyParticipant('speaker'),
    firstName: 'Marcus',
    lastName: 'Cicero',
    email: 'cicero@example.com',
    ...overrides,
  };
}

describe('buildParticipantSpecs', () => {
  it('orders the questions the way the organizer arranged them', () => {
    const shuffled = buildParticipantSpecs([
      fieldRow('biography', { position: 0 }),
      fieldRow('firstName', { position: 1 }),
    ]);
    expect(shuffled.map((field) => field.participantKey)).toEqual(['biography', 'firstName']);
  });

  /**
   * `F-6` locks First Name, Last Name and Email required. A row written before that lock existed —
   * or one an organizer reached past the UI to flip — must not be able to unlock itself, so the spec
   * is built from the constant rather than from the stored flag.
   */
  it('forces the three locked fields required whatever the row says', () => {
    const specs = buildParticipantSpecs([
      fieldRow('firstName', { required: false }),
      fieldRow('phone', { required: false, position: 1 }),
    ]);
    expect(specs.find((field) => field.participantKey === 'firstName')?.required).toBe(true);
    expect(specs.find((field) => field.participantKey === 'phone')?.required).toBe(false);
  });

  /** The constant is a ceiling, so a stored limit above it is clamped rather than honoured. */
  it('clamps a stored maximum above the built-in cap', () => {
    const [biography] = buildParticipantSpecs([fieldRow('biography', { maxLength: 40_000 })]);
    expect(biography.maxLength).toBe(5000);
  });

  it('honours a stored maximum below the cap', () => {
    const [biography] = buildParticipantSpecs([fieldRow('biography', { maxLength: 400 })]);
    expect(biography.maxLength).toBe(400);
  });

  it('ignores a row that is not a participant built-in at all', () => {
    expect(buildParticipantSpecs([fieldRow('firstName'), { ...fieldRow('phone'), builtinKey: 'title' }])).toHaveLength(
      1,
    );
  });
});

describe('validateParticipants', () => {
  it('accepts a submission that satisfies both the fields and the counts', () => {
    expect(() =>
      validateParticipants(
        allFields,
        [person(), person({ firstName: 'Tullia', email: 'tullia@example.com', role: 'co_speaker' })],
        roles,
        4,
      ),
    ).not.toThrow();
  });

  /**
   * Errors are keyed by position, because the participant stage renders several people at once and a
   * flat key would land every message on the first of them.
   */
  it('attributes a missing required field to the person who is missing it', () => {
    try {
      validateParticipants(
        allFields,
        [person(), person({ firstName: '', email: 'tullia@example.com', role: 'co_speaker' })],
        roles,
        4,
      );
      expect.unreachable();
    } catch (error) {
      const details = (error as AppError).details ?? {};
      expect(details['participants.1.firstName']).toBe('First name is required');
      expect(details['participants.0.firstName']).toBeUndefined();
    }
  });

  it('rejects an address that is not an address', () => {
    try {
      validateParticipants(allFields, [person({ email: 'not-an-email' })], roles, null);
      expect.unreachable();
    } catch (error) {
      expect((error as AppError).details?.['participants.0.email']).toContain('valid email');
    }
  });

  it('rejects a biography past the 5,000-character cap `F-6` names', () => {
    try {
      validateParticipants(allFields, [person({ biography: 'x'.repeat(5001) })], roles, null);
      expect.unreachable();
    } catch (error) {
      expect((error as AppError).details?.['participants.0.biography']).toContain('at most 5000');
    }
  });

  /**
   * Two people, one address: a real mistake on a stage where a submitter is copying a co-speaker's
   * details in. Without this the second one silently overwrites the first, and the submission ends
   * up with one participant where the submitter listed two.
   */
  it('rejects the same person listed twice', () => {
    try {
      validateParticipants(
        allFields,
        [person(), person({ role: 'co_speaker', firstName: 'Also Marcus' })],
        roles,
        4,
      );
      expect.unreachable();
    } catch (error) {
      expect((error as AppError).details?.['participants.1.email']).toBe(
        'This person is already on the submission',
      );
    }
  });

  it('enforces `F-7`’s per-role maximum at submit time', () => {
    try {
      validateParticipants(
        allFields,
        [person(), person({ email: 'tullia@example.com', firstName: 'Tullia' })],
        roles,
        4,
      );
      expect.unreachable();
    } catch (error) {
      expect((error as AppError).details?.speaker).toBe('Only one person can be the speaker');
    }
  });

  it('enforces `F-7`’s overall cap at submit time', () => {
    try {
      validateParticipants(
        allFields,
        [
          person(),
          person({ email: 'a@example.com', firstName: 'A', role: 'co_speaker' }),
          person({ email: 'b@example.com', firstName: 'B', role: 'co_speaker' }),
        ],
        roles,
        2,
      );
      expect.unreachable();
    } catch (error) {
      expect((error as AppError).details?.participants).toContain('at most 2 people');
    }
  });

  it('enforces a required role that nobody was given', () => {
    try {
      validateParticipants(allFields, [person({ role: 'co_speaker' })], roles, null);
      expect.unreachable();
    } catch (error) {
      expect((error as AppError).details?.speaker).toBe('This form needs a speaker');
    }
  });

  /**
   * An organizer who turned Biography off should not have it enforced. The gate reads the form's own
   * questions, so switching one off in the builder switches it off here without a second edit.
   */
  it('asks for nothing the form does not ask for', () => {
    const trimmed = buildParticipantSpecs([
      fieldRow('firstName', { position: 0 }),
      fieldRow('lastName', { position: 1 }),
      fieldRow('email', { position: 2 }),
    ]);
    expect(() =>
      validateParticipants(trimmed, [person({ biography: '', phone: '' })], roles, null),
    ).not.toThrow();
  });

  it('reports a field problem and a count problem in the same pass', () => {
    try {
      validateParticipants(
        allFields,
        [person({ firstName: '' }), person({ email: 'tullia@example.com', firstName: 'Tullia' })],
        roles,
        4,
      );
      expect.unreachable();
    } catch (error) {
      const details = (error as AppError).details ?? {};
      expect(details['participants.0.firstName']).toBeDefined();
      expect(details.speaker).toBeDefined();
    }
  });
});
