import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submission, submissionTag } from '../../db/schema';
import { submitFormStateKey } from '../../app/(public)/submit/shared';
import {
  rehydrateDraftValues,
  saveSubmission,
  type RuntimeField,
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

function field(key: string, builtinKey: RuntimeField['builtinKey'] = null): RuntimeField {
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
        field('title', 'title'),
        field('description', 'description'),
        field('format', 'format'),
        field('track', 'track'),
        field('level', 'level'),
        field('tags', 'tags'),
        field('takeaway'),
        field('seats'),
        field('recorded'),
        field('topics'),
        field('optional'),
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
      fields: [field('title', 'title')],
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
