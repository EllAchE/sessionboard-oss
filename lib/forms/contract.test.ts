import { describe, expect, it } from 'vitest';
import { AppError } from '../errors';
import {
  BUILTIN_FIELDS,
  charLimitUsage,
  clearHiddenAnswers,
  evaluateCondition,
  splitAnswers,
  validateAnswers,
  validateConditions,
  visibleFields,
  type FormFieldSpec,
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
