import { describe, expect, it } from 'vitest';
import { choiceError, tagsError } from './portal';

/**
 * `CFP-S2`. Session format, Track and Tags were asked on the public form and then not editable at
 * all — Track was read-only header text — leaving no way for a speaker to correct the two fields
 * organizers filter and route on. The portal now offers the event's own lists, and these are the
 * rule behind the controls: the edit view posts to a server action, and a server action takes
 * whatever it is given.
 */
const FORMATS = [
  { id: 'fmt-talk', name: 'Talk' },
  { id: 'fmt-workshop', name: 'Workshop' },
];

const TAGS = [
  { id: 'tag-ai', name: 'AI' },
  { id: 'tag-ops', name: 'Ops' },
];

describe('choiceError', () => {
  it('accepts an id the event has', () => {
    expect(choiceError('session format', 'fmt-workshop', FORMATS)).toBeNull();
  });

  /** Optional, so clearing it is an answer rather than an invalid one. */
  it('accepts a blank', () => {
    expect(choiceError('session format', '', FORMATS)).toBeNull();
    expect(choiceError('session format', undefined, FORMATS)).toBeNull();
  });

  it('refuses an id the event does not have', () => {
    expect(choiceError('session format', 'fmt-keynote', FORMATS)).toBe(
      'Choose one of the session formats offered',
    );
  });

  /**
   * These are ids, not names. Posting the label a speaker read has to fail, or a renamed track
   * would quietly detach every submission that chose it.
   */
  it('refuses the visible name in place of the id', () => {
    expect(choiceError('session format', 'Workshop', FORMATS)).toBe(
      'Choose one of the session formats offered',
    );
  });

  /** The form can leave the question out, in which case the editor renders no control at all. */
  it('refuses any value when the form does not ask', () => {
    expect(choiceError('track', 'trk-platform', null)).toBe('This form does not ask for a track');
  });

  it('accepts a form that does not ask being sent nothing', () => {
    expect(choiceError('track', '', null)).toBeNull();
  });

  it('says which question it is talking about', () => {
    expect(choiceError('track', 'nope', [])).toBe('Choose one of the tracks offered');
  });
});

describe('tagsError', () => {
  it('accepts ids the event has', () => {
    expect(tagsError(['tag-ai', 'tag-ops'], TAGS)).toBeNull();
  });

  /** Untagging everything is a legitimate save, not a missing answer. */
  it('accepts an empty set', () => {
    expect(tagsError([], TAGS)).toBeNull();
    expect(tagsError(undefined, TAGS)).toBeNull();
  });

  /**
   * All or nothing. Keeping the ids it recognized would leave a speaker looking at a set of tags
   * they did not choose, with no sign that anything was dropped.
   */
  it('refuses the whole set when one id is not the event’s', () => {
    expect(tagsError(['tag-ai', 'tag-invented'], TAGS)).toBe('Choose from the tags offered');
  });

  it('refuses any tag when the form does not ask', () => {
    expect(tagsError(['tag-ai'], null)).toBe('This form does not ask for tags');
  });

  it('accepts a form that does not ask being sent nothing', () => {
    expect(tagsError([], null)).toBeNull();
  });

  /** An event that has the question but no tags yet offers none, so none can be chosen. */
  it('refuses everything when the event has no tags', () => {
    expect(tagsError(['tag-ai'], [])).toBe('Choose from the tags offered');
    expect(tagsError([], [])).toBeNull();
  });
});
