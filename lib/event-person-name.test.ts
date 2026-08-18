import { describe, expect, it } from 'vitest';
import { eventPersonName } from './person-name';
import { commentAuthorName } from './services/files';

/*
  `CNT-S3`. Two names exist for one person: `participant.display_name` is per-event, `user.name` is
  the account. Renaming a speaker writes the first. Every surface that read the second kept showing
  whoever the account said they were — a different speaker's name, on her own uploads and comments.
*/

describe('eventPersonName', () => {
  it('prefers what this event calls the person over their account name', () => {
    expect(
      eventPersonName({
        displayName: 'Priya Raman',
        name: 'Marcus Vitruvius Pollio',
        email: 'vitruvius@example.com',
      }),
    ).toBe('Priya Raman');
  });

  it('falls back to the account name when the event has not renamed them', () => {
    expect(eventPersonName({ displayName: null, name: 'Ada Lovelace', email: 'ada@example.com' })).toBe(
      'Ada Lovelace',
    );
  });

  /* A blank display name is not a name. It is the column's default with a space typed into it. */
  it('ignores a display name that is only whitespace', () => {
    expect(eventPersonName({ displayName: '   ', name: 'Ada Lovelace', email: 'ada@example.com' })).toBe(
      'Ada Lovelace',
    );
  });

  it('ignores an account name that is only whitespace', () => {
    expect(eventPersonName({ displayName: null, name: ' ', email: 'ada@example.com' })).toBe(
      'ada@example.com',
    );
  });

  /* "Who uploaded this" has to have an answer even for an account that never filled in a name. */
  it('falls back to the address when there is no name at all', () => {
    expect(eventPersonName({ displayName: null, name: null, email: 'ada@example.com' })).toBe(
      'ada@example.com',
    );
  });

  it('accepts a person carrying neither name field', () => {
    expect(eventPersonName({ email: 'ada@example.com' })).toBe('ada@example.com');
  });

  it('trims the name it returns', () => {
    expect(eventPersonName({ displayName: '  Priya Raman  ', email: 'priya@example.com' })).toBe(
      'Priya Raman',
    );
  });
});

describe('commentAuthorName', () => {
  const PRIYA = { displayName: 'Priya Raman', name: 'Marcus Vitruvius Pollio', email: 'v@example.com' };
  const people = new Map([['user-1', PRIYA]]);

  /* The stored string is a snapshot from post time. The account is the answer. */
  it('re-resolves a comment posted before the organizer renamed its author', () => {
    expect(
      commentAuthorName(
        { authorUserId: 'user-1', authorName: 'Marcus Vitruvius Pollio' },
        people,
      ),
    ).toBe('Priya Raman');
  });

  /* Deleting an account must not blank the thread it posted in. */
  it('keeps the stored name when the author no longer resolves', () => {
    expect(commentAuthorName({ authorUserId: 'gone', authorName: 'Ada Lovelace' }, people)).toBe(
      'Ada Lovelace',
    );
  });

  it('keeps the stored name for a comment with no author at all', () => {
    expect(commentAuthorName({ authorUserId: null, authorName: 'Ada Lovelace' }, people)).toBe(
      'Ada Lovelace',
    );
  });
});
