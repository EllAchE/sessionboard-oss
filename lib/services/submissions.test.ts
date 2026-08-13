import { describe, expect, it } from 'vitest';
import { visibleFields } from '../forms/contract';
import { buildFieldSpecs, type FieldRow, type Taxonomy } from './submissions';

const TAXONOMY: Taxonomy = {
  formats: [
    { id: 'format-talk', name: 'Talk (45 min)' },
    { id: 'format-workshop', name: 'Workshop (120 min)' },
  ],
  tracks: [],
  tags: [],
};

function field(overrides: Partial<FieldRow> & Pick<FieldRow, 'id' | 'key'>): FieldRow {
  return {
    position: 0,
    step: 0,
    type: 'short_text',
    builtinKey: null,
    label: overrides.key,
    helpText: null,
    placeholder: null,
    required: false,
    options: null,
    showIf: null,
    minLength: null,
    maxLength: null,
    charLimitGroup: null,
    ...overrides,
  };
}

describe('buildFieldSpecs conditional option values', () => {
  const rows = [
    field({
      id: 'session-format',
      key: 'format',
      builtinKey: 'format',
      type: 'select',
      label: 'Session format',
    }),
    field({
      id: 'workshop-prerequisites',
      key: 'workshopPrerequisites',
      position: 1,
      type: 'long_text',
      label: 'Workshop prerequisites',
      showIf: {
        fieldId: 'session-format',
        op: 'eq',
        value: 'Workshop (120 min)',
      },
    }),
  ];

  it('represents a taxonomy condition with the same id submitted by the dropdown', () => {
    const fields = buildFieldSpecs(rows, TAXONOMY);

    expect(fields[0].options).toEqual(['format-talk', 'format-workshop']);
    expect(fields[0].optionLabels).toEqual({
      'format-talk': 'Talk (45 min)',
      'format-workshop': 'Workshop (120 min)',
    });
    expect(fields[1].showIf?.value).toBe('format-workshop');
  });

  it('shows for the matching dropdown id and hides again after switching away', () => {
    const fields = buildFieldSpecs(rows, TAXONOMY);

    expect(visibleFields(fields, { format: 'format-workshop' }).map((entry) => entry.key)).toEqual([
      'format',
      'workshopPrerequisites',
    ]);
    expect(visibleFields(fields, { format: 'format-talk' }).map((entry) => entry.key)).toEqual([
      'format',
    ]);
  });

  it('preserves conditions that already use a taxonomy id', () => {
    const fields = buildFieldSpecs(
      [
        rows[0],
        {
          ...rows[1],
          showIf: { fieldId: 'session-format', op: 'eq', value: 'format-workshop' },
        },
      ],
      TAXONOMY,
    );

    expect(fields[1].showIf?.value).toBe('format-workshop');
  });
});
