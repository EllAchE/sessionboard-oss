import { describe, expect, it } from 'vitest';
import { levelError } from './portal';

/**
 * `CFP-S2`. The portal's edit view rendered Audience level as an open text box, so a question the
 * public form asked with a Beginner/Intermediate/Advanced dropdown came back editable to any string
 * a speaker cared to type — into a column the review queue filters on and the exports group by.
 *
 * The dropdown is what a browser now posts, and this is the same rule on the other side of it: the
 * edit view submits to a server action, and a server action takes whatever it is given.
 */
const LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

describe('levelError', () => {
  it('accepts a value the form offers', () => {
    expect(levelError('Intermediate', LEVELS, 'Beginner')).toBeNull();
  });

  it('refuses one it does not, naming what it does', () => {
    expect(levelError('Wizard', LEVELS, 'Beginner')).toBe(
      'Choose one of Beginner, Intermediate, Advanced',
    );
  });

  /** Optional means clearable. Blanking it is an answer, not an invalid one. */
  it('accepts a blank', () => {
    expect(levelError('', LEVELS, 'Beginner')).toBeNull();
    expect(levelError(undefined, LEVELS, 'Beginner')).toBeNull();
  });

  /**
   * The old box let anything through and those values are still on the record. A speaker who came
   * back to fix a typo in the title would otherwise be held up by a value they cannot re-enter and
   * did not touch.
   */
  it('leaves whatever the record already says alone', () => {
    expect(levelError('Wizard', LEVELS, 'Wizard')).toBeNull();
  });

  /** But it cannot be reintroduced: moving off a legacy value is one-way. */
  it('will not take a legacy value onto a submission that does not have it', () => {
    expect(levelError('Wizard', LEVELS, 'Advanced')).toBe(
      'Choose one of Beginner, Intermediate, Advanced',
    );
  });

  /**
   * An organizer can remove the field from the form. The edit view then renders nothing, so a value
   * arriving anyway came from something other than the form.
   */
  it('refuses any value at all when the form does not ask', () => {
    expect(levelError('Beginner', null, null)).toBe(
      'This form does not ask for an audience level',
    );
  });

  it('accepts a form that does not ask being sent nothing', () => {
    expect(levelError('', null, null)).toBeNull();
  });

  /** An organizer's own list, not the default one. */
  it('holds to whatever list the organizer configured', () => {
    const own = ['Practitioner', 'Architect'];

    expect(levelError('Architect', own, null)).toBeNull();
    expect(levelError('Beginner', own, null)).toBe('Choose one of Practitioner, Architect');
  });
});
