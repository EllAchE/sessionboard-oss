import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitFormStateKey } from '../../app/(public)/submit/shared';
import { submission, submissionTag } from '../../db/schema';
import { validateAnswers, visibleFields } from '../forms/contract';
import {
  buildFieldSpecs,
  rehydrateDraftValues,
  saveSubmission,
  type FieldRow,
  type RuntimeField,
  type Taxonomy,
} from './submissions';

type Recorder = {
  existing: Record<string, unknown>;
  updates: Array<{ table: unknown; values: Record<string, unknown> }>;
  inserts: Array<{ table: unknown; values: unknown }>;
  deletes: unknown[];
};

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('../../db/client', () => ({ getDb: () => state.db }));

function fakeDb(recorder: Recorder) {
  const update = (table: unknown) => {
    let values: Record<string, unknown> = {};
    const builder = {
      set(nextValues: Record<string, unknown>) {
        values = nextValues;
        recorder.updates.push({ table, values: nextValues });
        return builder;
      },
      where: () => builder,
      returning: () => Promise.resolve([{ ...recorder.existing, ...values }]),
    };
    return builder;
  };

  const insert = (table: unknown) => {
    let values: unknown;
    const builder = {
      values(nextValues: unknown) {
        values = nextValues;
        recorder.inserts.push({ table, values: nextValues });
        return builder;
      },
      returning: () => Promise.resolve([]),
      onConflictDoNothing: () => Promise.resolve(values),
    };
    return builder;
  };

  const remove = (table: unknown) => ({
    where: async () => {
      recorder.deletes.push(table);
    },
  });

  return {
    query: { submission: { findFirst: async () => recorder.existing } },
    update,
    insert,
    delete: remove,
  };
}

function runtimeField(
  key: string,
  builtinKey: RuntimeField['builtinKey'] = null,
): RuntimeField {
  return {
    id: key,
    key,
    builtinKey,
    type: builtinKey === 'tags' ? 'multi_select' : 'short_text',
    label: key,
    position: 0,
    step: 1,
    required: builtinKey === 'title',
    options: null,
    showIf: null,
    minLength: null,
    maxLength: null,
    charLimitGroup: null,
    helpText: null,
    placeholder: null,
    optionLabels: null,
  };
}

function fieldRow(
  overrides: Partial<FieldRow> & Pick<FieldRow, 'id' | 'key'>,
): FieldRow {
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

const TAXONOMY: Taxonomy = {
  formats: [
    { id: 'format-talk', name: 'Talk (45 min)' },
    { id: 'format-workshop', name: 'Workshop (120 min)' },
  ],
  tracks: [],
  tags: [],
};

let recorder: Recorder;

beforeEach(() => {
  recorder = {
    existing: {
      id: 'draft-1',
      eventId: 'event-1',
      formId: 'form-1',
      ref: 1,
      submitterUserId: 'user-1',
      title: 'Earlier title',
      status: 'draft',
    },
    updates: [],
    inserts: [],
    deletes: [],
  };
  state.db = fakeDb(recorder);
});

describe('draft resume state', () => {
  it('gives a resumed draft a new form instance while keeping that draft stable', () => {
    expect(submitFormStateKey(null)).toBe('new');
    expect(submitFormStateKey('draft-1')).toBe('draft:draft-1');
    expect(submitFormStateKey('draft-2')).not.toBe(
      submitFormStateKey('draft-1'),
    );
  });

  it('rehydrates built-ins and every custom answer shape', () => {
    const values = rehydrateDraftValues(
      {
        title: 'Typed title',
        descriptionMarkdown: '**Detailed** abstract',
        formatId: 'format-workshop',
        trackId: 'track-platform',
        level: 'Advanced',
        answers: {
          takeaway: 'Ship safely',
          seats: 40,
          recorded: true,
          topics: ['testing', 'delivery'],
          optional: null,
        },
      },
      ['tag-typescript', 'tag-testing'],
      [
        runtimeField('title', 'title'),
        runtimeField('description', 'description'),
        runtimeField('format', 'format'),
        runtimeField('track', 'track'),
        runtimeField('level', 'level'),
        runtimeField('tags', 'tags'),
        runtimeField('takeaway'),
        runtimeField('seats'),
        runtimeField('recorded'),
        runtimeField('topics'),
        runtimeField('optional'),
      ],
    );

    expect(values).toEqual({
      title: 'Typed title',
      description: '**Detailed** abstract',
      format: 'format-workshop',
      track: 'track-platform',
      level: 'Advanced',
      tags: ['tag-typescript', 'tag-testing'],
      takeaway: 'Ship safely',
      seats: 40,
      recorded: true,
      topics: ['testing', 'delivery'],
      optional: null,
    });
  });
});

describe('resumed draft submission', () => {
  it('submits by updating the draft row instead of inserting a second submission', async () => {
    const saved = await saveSubmission({
      eventId: 'event-1',
      formId: 'form-1',
      userId: 'user-1',
      fields: [runtimeField('title', 'title')],
      values: { title: 'Final title' },
      limits: { allowDrafts: true, maxSubmissionsPerUser: 3 },
      mode: 'submit',
      submissionId: 'draft-1',
    });

    expect(saved).toMatchObject({
      id: 'draft-1',
      status: 'submitted',
      title: 'Final title',
    });
    expect(recorder.updates).toEqual([
      {
        table: submission,
        values: expect.objectContaining({
          title: 'Final title',
          status: 'submitted',
        }),
      },
    ]);
    expect(recorder.inserts).toEqual([]);
    expect(recorder.deletes).toEqual([submissionTag]);
  });
});

describe('buildFieldSpecs required choice questions with no choices', () => {
  const tagsRow = fieldRow({
    id: 'tags',
    key: 'tags',
    builtinKey: 'tags',
    type: 'multi_select',
    label: 'Tags',
    required: true,
  });

  it('drops the requirement when the event taxonomy is empty', () => {
    const [tags] = buildFieldSpecs([tagsRow], TAXONOMY);

    expect(tags.options).toEqual([]);
    expect(tags.required).toBe(false);
  });

  it('accepts a submission that leaves the unanswerable question blank', () => {
    const fields = buildFieldSpecs([tagsRow], TAXONOMY);

    expect(() => validateAnswers(fields, { tags: null })).not.toThrow();
  });

  it('keeps the requirement once the event has tags to offer', () => {
    const [tags] = buildFieldSpecs([tagsRow], {
      ...TAXONOMY,
      tags: [{ id: 'tag-ai', name: 'AI' }],
    });

    expect(tags.required).toBe(true);
    expect(() => validateAnswers([tags], { tags: null })).toThrow();
  });
});

describe('buildFieldSpecs conditional option values', () => {
  const rows = [
    fieldRow({
      id: 'session-format',
      key: 'format',
      builtinKey: 'format',
      type: 'select',
      label: 'Session format',
    }),
    fieldRow({
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

    expect(
      visibleFields(fields, { format: 'format-workshop' }).map(
        (entry) => entry.key,
      ),
    ).toEqual(['format', 'workshopPrerequisites']);
    expect(
      visibleFields(fields, { format: 'format-talk' }).map(
        (entry) => entry.key,
      ),
    ).toEqual(['format']);
  });

  it('preserves conditions that already use a taxonomy id', () => {
    const fields = buildFieldSpecs(
      [
        rows[0],
        {
          ...rows[1],
          showIf: {
            fieldId: 'session-format',
            op: 'eq',
            value: 'format-workshop',
          },
        },
      ],
      TAXONOMY,
    );

    expect(fields[1].showIf?.value).toBe('format-workshop');
  });
});
