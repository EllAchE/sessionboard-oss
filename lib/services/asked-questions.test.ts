import { describe, expect, it } from 'vitest';
import type { Condition, FormFieldSpec } from '../forms/contract';
import { askedAnswers } from './review';
import { askedQuestions, type AskedSource } from './submissions';

/*
  `CFP-S2`. A form whose workshop question is gated on the built-in Session format, which is the
  shape the evaluator built and the one the seeded demo happens not to have: its only condition
  points at a custom field, so the bug never showed there.
*/

const FORMAT_ID = 'fmt-workshop';
const TALK_ID = 'fmt-talk';

function field(overrides: Partial<FormFieldSpec> & { id: string; key: string }): FormFieldSpec {
  return {
    builtinKey: null,
    type: 'short_text',
    label: overrides.key,
    position: 0,
    step: 1,
    required: false,
    options: null,
    showIf: null,
    minLength: null,
    maxLength: null,
    charLimitGroup: null,
    ...overrides,
  };
}

const TITLE = field({ id: 'f-title', key: 'title', builtinKey: 'title', position: 0 });
const FORMAT = field({
  id: 'f-format',
  key: 'format',
  builtinKey: 'format',
  type: 'select',
  options: [TALK_ID, FORMAT_ID],
  position: 1,
});
const PREREQS = field({
  id: 'f-prereqs',
  key: 'prerequisites',
  label: 'Workshop prerequisites',
  type: 'long_text',
  position: 2,
  showIf: { fieldId: FORMAT.id, op: 'eq', value: FORMAT_ID } satisfies Condition,
});
const NOTES = field({ id: 'f-notes', key: 'notes', label: 'Anything else', position: 3 });

const FORM = [TITLE, FORMAT, PREREQS, NOTES];

function row(overrides: Partial<AskedSource> = {}): AskedSource {
  return {
    title: 'Taming 40-Minute CI',
    descriptionMarkdown: 'A talk about builds.',
    formatId: TALK_ID,
    trackId: null,
    level: null,
    answers: {},
    tagIds: [],
    ...overrides,
  };
}

describe('askedQuestions', () => {
  it('leaves out a question gated on a format the submission is not', () => {
    const keys = askedQuestions(FORM, row()).map((entry) => entry.key);
    expect(keys).toEqual(['title', 'format', 'notes']);
  });

  it('includes it once the submission is that format', () => {
    const keys = askedQuestions(FORM, row({ formatId: FORMAT_ID })).map((entry) => entry.key);
    expect(keys).toContain('prerequisites');
  });

  /* The regression itself: the gating value lives in a column, not in `answers`. */
  it('reads the gating value from the column rather than from the answer map', () => {
    const asked = askedQuestions(FORM, row({ formatId: FORMAT_ID, answers: {} }));
    expect(asked.map((entry) => entry.key)).toContain('prerequisites');
  });

  it('resolves a condition on the built-in track the same way', () => {
    const gated = field({
      id: 'f-cfp',
      key: 'cfp_notes',
      position: 4,
      showIf: { fieldId: 'f-track', op: 'eq', value: 'trk-infra' },
    });
    const track = field({ id: 'f-track', key: 'track', builtinKey: 'track', type: 'select' });
    const form = [...FORM, track, gated];

    expect(askedQuestions(form, row({ trackId: 'trk-infra' })).map((e) => e.key)).toContain(
      'cfp_notes',
    );
    expect(askedQuestions(form, row({ trackId: 'trk-web' })).map((e) => e.key)).not.toContain(
      'cfp_notes',
    );
  });

  it('answers questions gated on a custom answer from the answer map', () => {
    const parent = field({ id: 'f-recorded', key: 'prior_recording', type: 'select' });
    const child = field({
      id: 'f-link',
      key: 'recording_link',
      position: 5,
      showIf: { fieldId: parent.id, op: 'eq', value: 'yes' },
    });
    const form = [...FORM, parent, child];

    expect(
      askedQuestions(form, row({ answers: { prior_recording: 'yes' } })).map((e) => e.key),
    ).toContain('recording_link');
    expect(
      askedQuestions(form, row({ answers: { prior_recording: 'no' } })).map((e) => e.key),
    ).not.toContain('recording_link');
  });

  it('keeps the order the form is in', () => {
    expect(askedQuestions(FORM, row({ formatId: FORMAT_ID })).map((entry) => entry.key)).toEqual([
      'title',
      'format',
      'prerequisites',
      'notes',
    ]);
  });
});

describe('askedAnswers', () => {
  it('hides an answer stored against a question this submission was never asked', () => {
    const answers = { prerequisites: '', notes: 'Please schedule me early.' };
    expect(askedAnswers(answers, FORM, row())).toEqual({ notes: 'Please schedule me early.' });
  });

  it('shows it on a submission that was asked', () => {
    const answers = { prerequisites: 'Bring a laptop.', notes: '' };
    expect(askedAnswers(answers, FORM, row({ formatId: FORMAT_ID }))).toEqual(answers);
  });

  /*
    Already-stored empties are the damage the write path did before the fix, so filtering has to be
    at render — a row saved by the old portal keeps the key.
  */
  it('hides a non-empty answer too, because a value there is stale rather than asked', () => {
    const answers = { prerequisites: 'Left over from when this was a workshop.' };
    expect(askedAnswers(answers, FORM, row())).toEqual({});
  });

  /* An answer with no question left to consult. The panel falls back to the raw key for these. */
  it('keeps an answer whose question is no longer on the form', () => {
    const answers = { retired_question: 'Answered before that question was deleted.' };
    expect(askedAnswers(answers, FORM, row())).toEqual(answers);
  });

  it('leaves an unconditional questionnaire untouched', () => {
    const form = [TITLE, NOTES];
    const answers = { notes: 'No conditions anywhere on this form.' };
    expect(askedAnswers(answers, form, row())).toEqual(answers);
  });
});
