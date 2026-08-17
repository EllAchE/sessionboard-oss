import { describe, expect, it } from 'vitest';
import { AppError } from '../errors';
import {
  BUILTIN_FIELDS,
  BUILTIN_META,
  PAGE_HEADING_MAX_LENGTH,
  PARTICIPANT_BUILTIN_FIELDS,
  PARTICIPANT_BUILTIN_META,
  builtinMaxLength,
  charLimitUsage,
  clearHiddenAnswers,
  evaluateCondition,
  resolveFieldType,
  splitAnswers,
  validateAnswers,
  validateConditions,
  validateParticipantCounts,
  validateRoleConfiguration,
  visibleFields,
  type FormFieldSpec,
  type ParticipantRoleSpec,
} from './contract';

function field(overrides: Partial<FormFieldSpec> & Pick<FormFieldSpec, 'id' | 'key'>): FormFieldSpec {
  return {
    builtinKey: null,
    type: 'short_text',
    label: overrides.key,
    position: 0,
    step: 0,
    required: false,
    options: null,
    showIf: null,
    minLength: null,
    maxLength: null,
    charLimitGroup: null,
    ...overrides,
  };
}

describe('evaluateCondition', () => {
  it.each([
    ['eq', 'yes', 'yes', true],
    ['eq', 'yes', 'no', false],
    ['neq', 'yes', 'no', true],
    ['gt', 5, 3, true],
    ['lt', 2, 3, true],
  ] as const)('%s compares %s against %s', (op, value, expected, result) => {
    expect(evaluateCondition({ fieldId: 'a', op, value: expected }, value)).toBe(result);
  });

  it('treats an empty array as empty', () => {
    expect(evaluateCondition({ fieldId: 'a', op: 'is_empty' }, [])).toBe(true);
    expect(evaluateCondition({ fieldId: 'a', op: 'not_empty' }, ['x'])).toBe(true);
  });

  it('matches inside a multi-select', () => {
    expect(evaluateCondition({ fieldId: 'a', op: 'includes', value: 'b' }, ['a', 'b'])).toBe(true);
    expect(evaluateCondition({ fieldId: 'a', op: 'includes', value: 'c' }, ['a', 'b'])).toBe(false);
  });
});

describe('visibility', () => {
  const fields = [
    field({ id: '1', key: 'needsAv', position: 0 }),
    field({ id: '2', key: 'avDetails', position: 1, showIf: { fieldId: '1', op: 'eq', value: 'yes' } }),
  ];

  it('hides a field whose condition fails', () => {
    expect(visibleFields(fields, { needsAv: 'no' }).map((f) => f.key)).toEqual(['needsAv']);
  });

  it('shows a field whose condition passes', () => {
    expect(visibleFields(fields, { needsAv: 'yes' }).map((f) => f.key)).toEqual(['needsAv', 'avDetails']);
  });

  it('shows a field whose target no longer exists rather than stranding it', () => {
    const orphan = [field({ id: '9', key: 'x', showIf: { fieldId: 'gone', op: 'eq', value: 'y' } })];
    expect(visibleFields(orphan, {})).toHaveLength(1);
  });
});

describe('validateConditions — the one-hop rule', () => {
  it('accepts a condition on an earlier field', () => {
    expect(() =>
      validateConditions([
        field({ id: '1', key: 'a', position: 0 }),
        field({ id: '2', key: 'b', position: 1, showIf: { fieldId: '1', op: 'not_empty' } }),
      ]),
    ).not.toThrow();
  });

  it('rejects a condition on a later field', () => {
    expect(() =>
      validateConditions([
        field({ id: '1', key: 'a', position: 0, showIf: { fieldId: '2', op: 'not_empty' } }),
        field({ id: '2', key: 'b', position: 1 }),
      ]),
    ).toThrow(AppError);
  });

  it('rejects a self-reference', () => {
    expect(() =>
      validateConditions([field({ id: '1', key: 'a', showIf: { fieldId: '1', op: 'not_empty' } })]),
    ).toThrow(AppError);
  });

  it('rejects a chain, which is what removes the cascade bug class', () => {
    expect(() =>
      validateConditions([
        field({ id: '1', key: 'a', position: 0 }),
        field({ id: '2', key: 'b', position: 1, showIf: { fieldId: '1', op: 'not_empty' } }),
        field({ id: '3', key: 'c', position: 2, showIf: { fieldId: '2', op: 'not_empty' } }),
      ]),
    ).toThrow(/cannot chain/);
  });
});

describe('clearHiddenAnswers', () => {
  it('drops the answer to a question that was not asked', () => {
    const fields = [
      field({ id: '1', key: 'needsAv', position: 0 }),
      field({ id: '2', key: 'avDetails', position: 1, showIf: { fieldId: '1', op: 'eq', value: 'yes' } }),
    ];
    const cleared = clearHiddenAnswers(fields, { needsAv: 'no', avDetails: 'a projector' });
    expect(cleared).toEqual({ needsAv: 'no' });
  });
});

describe('splitAnswers', () => {
  it('routes builtins to columns and everything else to JSONB', () => {
    const fields = [
      field({ id: '1', key: 'title', builtinKey: 'title' }),
      field({ id: '2', key: 'whyYou', type: 'long_text' }),
      field({ id: '3', key: 'divider', type: 'section_break' }),
    ];
    const { builtins, answers } = splitAnswers(fields, { title: 'A talk', whyYou: 'because' });
    expect(builtins).toEqual({ title: 'A talk' });
    expect(answers).toEqual({ whyYou: 'because' });
  });

  it('never puts a builtin in answers, for every builtin', () => {
    const fields = BUILTIN_FIELDS.map((key, i) => field({ id: String(i), key, builtinKey: key }));
    const values = Object.fromEntries(BUILTIN_FIELDS.map((key) => [key, 'x']));
    expect(splitAnswers(fields, values).answers).toEqual({});
  });
});

describe('validateAnswers', () => {
  it('requires a required visible field', () => {
    const fields = [field({ id: '1', key: 'title', required: true })];
    expect(() => validateAnswers(fields, {})).toThrow(AppError);
  });

  it('does not require a required field that is hidden', () => {
    const fields = [
      field({ id: '1', key: 'needsAv', position: 0 }),
      field({
        id: '2',
        key: 'avDetails',
        position: 1,
        required: true,
        showIf: { fieldId: '1', op: 'eq', value: 'yes' },
      }),
    ];
    expect(() => validateAnswers(fields, { needsAv: 'no' })).not.toThrow();
  });

  it('measures length on rendered text, not markdown syntax', () => {
    const fields = [field({ id: '1', key: 'bio', type: 'markdown', maxLength: 5 })];
    expect(() => validateAnswers(fields, { bio: '**hello**' })).not.toThrow();
  });

  it('enforces a combined limit across a char-limit group (F-15)', () => {
    const fields = [
      field({ id: '1', key: 'abstract', type: 'long_text', maxLength: 20, charLimitGroup: 'combined' }),
      field({ id: '2', key: 'bio', type: 'long_text', maxLength: 20, charLimitGroup: 'combined' }),
    ];
    expect(() => validateAnswers(fields, { abstract: 'a'.repeat(15), bio: 'b'.repeat(4) })).not.toThrow();
    try {
      validateAnswers(fields, { abstract: 'a'.repeat(15), bio: 'b'.repeat(10) });
      expect.unreachable();
    } catch (error) {
      expect((error as AppError).details?.combined).toMatch(/combined limit of 20/);
    }
  });

  it('rejects a select value outside its options', () => {
    const fields = [field({ id: '1', key: 'level', type: 'select', options: ['intro', 'advanced'] })];
    expect(() => validateAnswers(fields, { level: 'expert' })).toThrow(AppError);
  });

  it('reports every bad field at once rather than one at a time', () => {
    const fields = [
      field({ id: '1', key: 'title', required: true }),
      field({ id: '2', key: 'email', type: 'email' }),
    ];
    try {
      validateAnswers(fields, { email: 'nope' });
      expect.unreachable();
    } catch (error) {
      expect((error as AppError).details).toEqual({
        title: 'title is required',
        email: 'email must be a valid email address',
      });
    }
  });
});

describe('charLimitUsage', () => {
  it('sums the group for the live counter', () => {
    const fields = [
      field({ id: '1', key: 'a', maxLength: 100, charLimitGroup: 'g' }),
      field({ id: '2', key: 'b', maxLength: 100, charLimitGroup: 'g' }),
      field({ id: '3', key: 'c', maxLength: 100 }),
    ];
    expect(charLimitUsage(fields, { a: 'xxx', b: 'yy', c: 'zzzzz' }, 'g')).toEqual({ used: 5, limit: 100 });
  });
});

// ---------------------------------------------------------------------------
// `F-5` / `F-6` — the constants the brief actually names
// ---------------------------------------------------------------------------

describe('built-in field constants', () => {
  /**
   * These are not style preferences. The brief stars five of the six abstract fields and caps Title
   * at 255 and Description at 5,000, and before this test existed `BUILTIN_META` carried no cap at
   * all — so every form ever created had an unlimited Title, and four of the five starred fields
   * arrived optional.
   */
  it('stars the five fields `F-5` stars, and only those', () => {
    const starred = BUILTIN_FIELDS.filter((key) => BUILTIN_META[key].required);
    expect(starred).toEqual(['title', 'description', 'format', 'track', 'tags']);
    expect(BUILTIN_META.level.required).toBe(false);
  });

  it('carries the two character caps `F-5` names', () => {
    expect(BUILTIN_META.title.maxLength).toBe(255);
    expect(BUILTIN_META.description.maxLength).toBe(5000);
  });

  it('locks the three participant fields `F-6` calls locked, and no others', () => {
    const locked = PARTICIPANT_BUILTIN_FIELDS.filter(
      (key) => PARTICIPANT_BUILTIN_META[key].requiredLocked,
    );
    expect(locked).toEqual(['firstName', 'lastName', 'email']);
  });

  it('caps the biography at 5,000 characters, as `F-6` asks', () => {
    expect(PARTICIPANT_BUILTIN_META.biography.maxLength).toBe(5000);
    expect(PARTICIPANT_BUILTIN_META.biography.type).toBe('markdown');
  });

  it('treats a built-in cap as a ceiling on whichever entity it belongs to', () => {
    expect(builtinMaxLength('abstract', 'title')).toBe(255);
    expect(builtinMaxLength('participant', 'biography')).toBe(5000);
    // A custom question has no ceiling — only the built-ins are load-bearing elsewhere.
    expect(builtinMaxLength('abstract', 'takeaways')).toBeNull();
    expect(builtinMaxLength('participant', 'title')).toBeNull();
  });

  it('caps the welcome screen heading where `F-9` caps it', () => {
    expect(PAGE_HEADING_MAX_LENGTH).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// `F-7` — participant roles and counts
// ---------------------------------------------------------------------------

function role(overrides: Partial<ParticipantRoleSpec> & Pick<ParticipantRoleSpec, 'kind'>): ParticipantRoleSpec {
  return {
    id: overrides.kind,
    label: overrides.kind,
    position: 0,
    minCount: 0,
    maxCount: null,
    ...overrides,
  };
}

describe('validateRoleConfiguration', () => {
  it('accepts limits that can all be met at once', () => {
    expect(() =>
      validateRoleConfiguration(
        [role({ kind: 'speaker', minCount: 1, maxCount: 1 }), role({ kind: 'panelist', maxCount: 3 })],
        4,
      ),
    ).not.toThrow();
  });

  /**
   * The failure this exists to catch: minimums that sum past the cap. Every submission to such a form
   * is rejected, and the organizer would otherwise learn that from a speaker who cannot get past the
   * participant stage rather than from the screen they configured it on.
   */
  it('rejects minimums that cannot fit under the overall cap', () => {
    expect(() =>
      validateRoleConfiguration(
        [role({ kind: 'speaker', minCount: 2 }), role({ kind: 'moderator', minCount: 2 })],
        3,
      ),
    ).toThrow(AppError);
  });

  it('rejects a minimum above its own maximum', () => {
    expect(() =>
      validateRoleConfiguration([role({ kind: 'speaker', minCount: 3, maxCount: 2 })], null),
    ).toThrow(AppError);
  });

  it('rejects a maximum of zero, which is a role nobody could ever hold', () => {
    expect(() => validateRoleConfiguration([role({ kind: 'speaker', maxCount: 0 })], null)).toThrow(
      AppError,
    );
  });
});

describe('validateParticipantCounts', () => {
  const roles = [
    role({ kind: 'speaker', label: 'Speaker', minCount: 1, maxCount: 1 }),
    role({ kind: 'co_speaker', label: 'Co-speaker', minCount: 0, maxCount: 2 }),
  ];

  it('accepts a cast that satisfies every rule', () => {
    expect(() =>
      validateParticipantCounts(roles, ['speaker', 'co_speaker', 'co_speaker'], 4),
    ).not.toThrow();
  });

  it('rejects a second speaker when the form allows one', () => {
    try {
      validateParticipantCounts(roles, ['speaker', 'speaker'], null);
      expect.unreachable();
    } catch (error) {
      expect((error as AppError).details?.speaker).toBe('Only one person can be the speaker');
      // The headline names the actual problem rather than summarising that there is one.
      expect((error as AppError).message).toBe('Only one person can be the speaker');
    }
  });

  it('rejects a submission missing a required role entirely', () => {
    try {
      validateParticipantCounts(roles, ['co_speaker'], null);
      expect.unreachable();
    } catch (error) {
      expect((error as AppError).details?.speaker).toBe('This form needs a speaker');
    }
  });

  it('rejects more people than the overall cap, whatever their roles', () => {
    try {
      validateParticipantCounts(roles, ['speaker', 'co_speaker'], 1);
      expect.unreachable();
    } catch (error) {
      expect((error as AppError).details?.participants).toContain('at most 1 person');
    }
  });

  it('rejects a role the form does not offer', () => {
    expect(() => validateParticipantCounts(roles, ['speaker', 'moderator'], null)).toThrow(AppError);
  });

  /**
   * With no roles configured there is nothing to check against, and this function can only say so by
   * rejecting every role as unoffered. That is the wrong answer for a form built before roles
   * existed, which is exactly why `assertParticipantLimits` short-circuits on an empty set before
   * reaching here. The boundary is pinned in both directions so a refactor cannot move it silently.
   */
  it('rejects every role when no role set is configured', () => {
    expect(() => validateParticipantCounts([], ['speaker'], null)).toThrow(AppError);
  });

  it('says nothing about a submission with nobody on it and nothing required', () => {
    expect(() => validateParticipantCounts([role({ kind: 'speaker' })], [], null)).not.toThrow();
  });

  /**
   * The portal's share flow checks ceilings only. Adding a person can cross a maximum but can never
   * be the reason a minimum is unmet, and telling a speaker "this form needs a speaker" while they
   * are adding a panelist is a true statement about a problem they cannot fix from that screen.
   */
  describe('in ceilings mode', () => {
    it('still refuses a person who would cross a maximum', () => {
      expect(() =>
        validateParticipantCounts(roles, ['speaker', 'speaker'], null, 'ceilings'),
      ).toThrow(AppError);
    });

    it('still refuses a person who would cross the overall cap', () => {
      expect(() =>
        validateParticipantCounts(roles, ['speaker', 'co_speaker'], 1, 'ceilings'),
      ).toThrow(AppError);
    });

    it('does not refuse a share onto a submission that is short of a minimum', () => {
      expect(() =>
        validateParticipantCounts(roles, ['co_speaker'], null, 'ceilings'),
      ).not.toThrow();
    });
  });
});

describe('resolveFieldType', () => {
  it('leaves a custom field with the type the organizer picked', () => {
    expect(resolveFieldType({ builtinKey: null, type: 'select' })).toBe('select');
    expect(resolveFieldType({ builtinKey: null, type: 'radio' })).toBe('radio');
    expect(resolveFieldType({ entity: 'abstract', builtinKey: null, type: 'long_text' })).toBe(
      'long_text',
    );
  });

  /**
   * The `CFP-01` gap. `db/seed.ts` stored the built-in `level` as `radio` while `BUILTIN_META` calls
   * it a dropdown, and the two surfaces disagreed about which one to believe.
   */
  it('overrules a stored type that contradicts an abstract built-in', () => {
    expect(resolveFieldType({ entity: 'abstract', builtinKey: 'level', type: 'radio' })).toBe(
      'select',
    );
    expect(resolveFieldType({ builtinKey: 'description', type: 'short_text' })).toBe('markdown');
  });

  it('overrules a stored type that contradicts a participant built-in', () => {
    expect(
      resolveFieldType({ entity: 'participant', participantKey: 'email', type: 'short_text' }),
    ).toBe('email');
    expect(
      resolveFieldType({ entity: 'participant', builtinKey: 'biography', type: 'short_text' }),
    ).toBe('markdown');
  });

  it('agrees with the constants for every built-in in both namespaces', () => {
    for (const key of BUILTIN_FIELDS) {
      expect(resolveFieldType({ entity: 'abstract', builtinKey: key, type: 'file' })).toBe(
        BUILTIN_META[key].type,
      );
    }
    for (const key of PARTICIPANT_BUILTIN_FIELDS) {
      expect(resolveFieldType({ entity: 'participant', participantKey: key, type: 'file' })).toBe(
        PARTICIPANT_BUILTIN_META[key].type,
      );
    }
  });

  it('falls back to the stored type when the key is not a built-in at all', () => {
    expect(resolveFieldType({ entity: 'abstract', builtinKey: 'nonsense', type: 'number' })).toBe(
      'number',
    );
    expect(
      resolveFieldType({ entity: 'participant', participantKey: 'nonsense', type: 'number' }),
    ).toBe('number');
  });
});
