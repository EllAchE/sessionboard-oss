import { describe, expect, it } from 'vitest';
import { BUILTIN_FIELDS, BUILTIN_META, validateConditions, type FormFieldSpec } from '../../../lib/forms/contract';
import {
  canAddOptions,
  canChangeFieldKey,
  canChangeFieldType,
  canDeleteField,
  charLimitGroups,
  conditionOpsFor,
  eligibleConditionTargets,
  isLockedField,
  lockReason,
  uniqueFieldKey,
} from './field-rules';

function field(overrides: Partial<FormFieldSpec> & Pick<FormFieldSpec, 'id'>): FormFieldSpec {
  return {
    key: overrides.id,
    builtinKey: null,
    type: 'short_text',
    label: overrides.id,
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

describe('builtin locking', () => {
  it('locks every one of the six', () => {
    for (const key of BUILTIN_FIELDS) {
      const builtin = field({ id: key, builtinKey: key, type: BUILTIN_META[key].type });
      expect(isLockedField(builtin)).toBe(true);
      expect(canDeleteField(builtin)).toBe(false);
      expect(canChangeFieldType(builtin)).toBe(false);
      expect(canChangeFieldKey(builtin)).toBe(false);
      expect(lockReason(builtin)).toBeTruthy();
    }
  });

  it('leaves custom fields fully editable', () => {
    const custom = field({ id: 'a', type: 'select' });
    expect(isLockedField(custom)).toBe(false);
    expect(canDeleteField(custom)).toBe(true);
    expect(canChangeFieldType(custom)).toBe(true);
    expect(canAddOptions(custom)).toBe(true);
    expect(lockReason(custom)).toBeNull();
  });

  it('does not offer a choice list on a builtin select, whose choices come from the event', () => {
    expect(canAddOptions(field({ id: 'track', builtinKey: 'track', type: 'select' }))).toBe(false);
  });

  it('treats an unknown builtinKey as a custom field rather than a half-locked one', () => {
    const bogus = field({ id: 'x', builtinKey: 'speaker_bio' as never });
    expect(isLockedField(bogus)).toBe(false);
  });
});

describe('eligibleConditionTargets', () => {
  const fields = [
    field({ id: 'a', position: 0 }),
    field({ id: 'b', position: 1, type: 'select', options: ['x', 'y'] }),
    field({ id: 'sep', position: 2, type: 'section_break' }),
    field({ id: 'c', position: 3, showIf: { fieldId: 'a', op: 'not_empty' } }),
    field({ id: 'd', position: 4 }),
  ];

  it('offers only earlier fields', () => {
    expect(eligibleConditionTargets(fields, 'b').map((f) => f.id)).toEqual(['a']);
    expect(eligibleConditionTargets(fields, 'a')).toEqual([]);
  });

  it('never offers the field itself', () => {
    expect(eligibleConditionTargets(fields, 'd').map((f) => f.id)).not.toContain('d');
  });

  it('excludes section breaks, which collect no answer', () => {
    expect(eligibleConditionTargets(fields, 'd').map((f) => f.id)).not.toContain('sep');
  });

  it('excludes fields that are themselves conditional, because conditions cannot chain', () => {
    expect(eligibleConditionTargets(fields, 'd').map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('offers every eligible field to a question not yet added', () => {
    expect(eligibleConditionTargets(fields, null).map((f) => f.id)).toEqual(['a', 'b', 'd']);
  });

  it('reads running order from position, not array order', () => {
    const shuffled = [fields[4], fields[0], fields[1]];
    expect(eligibleConditionTargets(shuffled, 'd').map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('returns nothing for a field that is not on the form', () => {
    expect(eligibleConditionTargets(fields, 'missing')).toEqual([]);
  });

  /** The guarantee the editor exists to make: anything it offers survives the save-time gate. */
  it('only ever offers targets that validateConditions accepts', () => {
    for (const subject of fields) {
      for (const target of eligibleConditionTargets(fields, subject.id)) {
        const next = fields.map((f) =>
          f.id === subject.id ? { ...f, showIf: { fieldId: target.id, op: 'not_empty' as const } } : f,
        );
        expect(() => validateConditions(next)).not.toThrow();
      }
    }
  });

  it('would have offered a target that validateConditions rejects, if it did not filter', () => {
    const broken = fields.map((f) =>
      f.id === 'b' ? { ...f, showIf: { fieldId: 'd', op: 'not_empty' as const } } : f,
    );
    expect(() => validateConditions(broken)).toThrow();
  });
});

describe('condition operators', () => {
  it('offers no operator for a section break', () => {
    expect(conditionOpsFor('section_break')).toEqual([]);
  });

  it('offers ordering operators only where ordering means something', () => {
    expect(conditionOpsFor('number')).toContain('gt');
    expect(conditionOpsFor('select')).not.toContain('gt');
  });
});

describe('answer keys', () => {
  it('slugs a label into a stable snake_case key', () => {
    expect(uniqueFieldKey([], 'What is your T-shirt size?')).toBe('what_is_your_t_shirt_size');
  });

  it('never collides with a key already on the form', () => {
    expect(uniqueFieldKey(['bio'], 'Bio')).toBe('bio_2');
    expect(uniqueFieldKey(['bio', 'bio_2'], 'Bio')).toBe('bio_3');
  });

  it('falls back rather than emitting an empty key', () => {
    expect(uniqueFieldKey([], '???')).toBe('field');
  });
});

describe('charLimitGroups', () => {
  it('groups members and reports the largest maximum as the combined limit', () => {
    const grouped = charLimitGroups([
      field({ id: 'a', charLimitGroup: 'pitch', maxLength: 300 }),
      field({ id: 'b', charLimitGroup: 'pitch', maxLength: 500 }),
      field({ id: 'c' }),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].group).toBe('pitch');
    expect(grouped[0].limit).toBe(500);
    expect(grouped[0].fields.map((f) => f.id)).toEqual(['a', 'b']);
  });
});
