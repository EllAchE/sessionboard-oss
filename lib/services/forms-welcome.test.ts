import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PAGE_HEADING_MAX_LENGTH,
  hasWelcomeScreen,
  welcomeScreenErrors,
} from '../forms/contract';
import { isAppError, type AppError } from '../errors';
import type { EventContext } from '../context';
import { createForm, publishForm, updateForm } from './forms';

/**
 * `F-9`. The brief stars Internal Form Name, External Form Title and Page Heading; only the first was
 * ever mandatory, because the public runtime falls back to the internal name and the page heading
 * simply renders nothing when it is blank. Neither absence was visible to the organizer who caused it.
 *
 * The rule is enforced at two moments and the difference between them is the whole design, so both
 * are tested here: a save may not *take away* a starred value, and a form may not *open* without one.
 * Splitting it that way is what keeps a form written before the rule existed editable — its close
 * date can still be changed — while still stopping it from reaching a speaker half-configured.
 */

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('../../db/client', () => ({ getDb: () => state.db }));

type Rows = {
  form: Record<string, unknown> | null;
  forms: Array<Record<string, unknown>>;
  formField: Array<Record<string, unknown>>;
  formParticipantRole: Array<Record<string, unknown>>;
};

let rows: Rows;
let updates: Array<Record<string, unknown>>;
let inserted: Array<Record<string, unknown>>;

/** Chainable and awaitable at any point, which is the only shape of drizzle these calls use. */
function fakeDb() {
  const table = (name: string) => ({
    findFirst: async () => (name === 'form' ? rows.form : null),
    findMany: async () => (name === 'form' ? rows.forms : (rows[name as keyof Rows] as unknown[])),
  });

  return {
    query: new Proxy({}, { get: (_target, name: string) => table(name) }),
    insert: () => ({
      values(values: Record<string, unknown> | Array<Record<string, unknown>>) {
        inserted.push(...(Array.isArray(values) ? values : [values]));
        return this;
      },
      returning: async () => [{ id: 'form-new', ...inserted[inserted.length - 1] }],
    }),
    update: () => ({
      set(values: Record<string, unknown>) {
        updates.push(values);
        return this;
      },
      where() {
        return this;
      },
      returning: async () => [{ ...rows.form, ...updates[updates.length - 1] }],
    }),
  };
}

const ctx: EventContext = {
  actor: {
    userId: 'user-1',
    email: 'chair@example.test',
    name: 'Chair',
    impersonatedByUserId: null,
  },
  eventId: 'event-1',
  roles: ['organizer'],
};

/** A `cfp` form with the welcome screen filled in, as `createForm` now leaves one. */
function formRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'form-1',
    eventId: 'event-1',
    kind: 'cfp',
    name: 'Call for speakers 2026',
    slug: 'cfp-2026',
    externalTitle: 'Speak at Cicero Forum',
    pageHeading: 'Speak in 2026',
    showWelcome: true,
    status: 'draft',
    collectsParticipants: false,
    maxParticipants: null,
    opensAt: null,
    closesAt: null,
    ...overrides,
  };
}

const QUESTION = {
  id: 'field-1',
  formId: 'form-1',
  entity: 'abstract',
  type: 'short_text',
  key: 'title',
  builtinKey: 'title',
  label: 'Title',
  position: 0,
  step: 0,
  required: true,
  options: null,
  showIf: null,
  minLength: null,
  maxLength: 255,
  charLimitGroup: null,
  helpText: null,
  placeholder: null,
  libraryEntryId: null,
};

async function rejection(work: Promise<unknown>): Promise<AppError> {
  try {
    await work;
  } catch (error) {
    if (isAppError(error)) return error;
    throw error;
  }
  throw new Error('expected the call to be refused');
}

beforeEach(() => {
  rows = { form: formRow(), forms: [], formField: [QUESTION], formParticipantRole: [] };
  updates = [];
  inserted = [];
  state.db = fakeDb();
});

describe('welcomeScreenErrors', () => {
  it('accepts a welcome screen with both starred fields filled in', () => {
    expect(
      welcomeScreenErrors({ externalTitle: 'Speak at Cicero Forum', pageHeading: 'Speak in 2026' }),
    ).toEqual({});
  });

  it('reports each starred field that is missing, by name', () => {
    const errors = welcomeScreenErrors({ externalTitle: null, pageHeading: null });
    expect(errors.externalTitle).toBeDefined();
    expect(errors.pageHeading).toBeDefined();
  });

  it('treats whitespace as blank rather than as a value', () => {
    expect(welcomeScreenErrors({ externalTitle: '   ', pageHeading: '\n' })).toEqual(
      welcomeScreenErrors({ externalTitle: '', pageHeading: '' }),
    );
  });

  it('still holds the brief’s 15-character cap on the heading', () => {
    const errors = welcomeScreenErrors({
      externalTitle: 'Fine',
      pageHeading: 'x'.repeat(PAGE_HEADING_MAX_LENGTH + 1),
    });
    expect(errors.pageHeading).toContain(String(PAGE_HEADING_MAX_LENGTH));
    expect(welcomeScreenErrors({ externalTitle: 'Fine', pageHeading: 'x'.repeat(15) })).toEqual({});
  });
});

describe('hasWelcomeScreen', () => {
  /**
   * A portal form is reached through a task assignment and renders neither the title nor the heading,
   * so requiring copy for a screen it does not have would block the seeds and every organizer for a
   * page nobody would ever see.
   */
  it('binds cfp forms and leaves portal forms alone', () => {
    expect(hasWelcomeScreen('cfp')).toBe(true);
    expect(hasWelcomeScreen('portal')).toBe(false);
  });
});

describe('createForm', () => {
  it('writes the external title rather than leaving the publish gate to fail on a brand new form', async () => {
    await createForm(ctx, { name: 'Call for workshops', kind: 'cfp' });
    const [created] = inserted;
    expect(created.externalTitle).toBe('Call for workshops');
    expect(welcomeScreenErrors({ ...created, pageHeading: 'placeholder' })).toEqual({});
  });
});

describe('updateForm', () => {
  it('refuses a save that blanks the external title', async () => {
    const error = await rejection(updateForm(ctx, 'form-1', { externalTitle: '  ' }));
    expect(error.details?.externalTitle).toBeDefined();
    expect(updates).toHaveLength(0);
  });

  it('refuses a save that blanks the page heading', async () => {
    const error = await rejection(updateForm(ctx, 'form-1', { pageHeading: '' }));
    expect(error.details?.pageHeading).toBeDefined();
    expect(updates).toHaveLength(0);
  });

  it('still refuses a heading over the 15-character cap', async () => {
    const error = await rejection(updateForm(ctx, 'form-1', { pageHeading: 'Speak with us in 2026' }));
    expect(error.details?.pageHeading).toContain('15');
  });

  it('accepts a save that sets both', async () => {
    await updateForm(ctx, 'form-1', { externalTitle: ' Speak with us ', pageHeading: ' Hello ' });
    expect(updates[0]).toMatchObject({ externalTitle: 'Speak with us', pageHeading: 'Hello' });
  });

  /**
   * The existing-form path. A `cfp` form written before this rule carries NULL in both columns; a
   * save that is not about the welcome screen must still go through, or the organizer is locked out
   * of the close date, the notification list and everything else by a field they were never asked for.
   */
  it('lets a form that never had a welcome screen change its other settings', async () => {
    rows.form = formRow({ externalTitle: null, pageHeading: null });
    await updateForm(ctx, 'form-1', { allowDrafts: false });
    expect(updates[0]).toMatchObject({ allowDrafts: false });
  });

  it('leaves portal forms out of it entirely', async () => {
    rows.form = formRow({ kind: 'portal', externalTitle: null, pageHeading: null });
    await updateForm(ctx, 'form-1', { externalTitle: null, pageHeading: null });
    expect(updates[0]).toMatchObject({ externalTitle: null, pageHeading: null });
  });
});

describe('publishForm', () => {
  it('opens a form whose welcome screen is complete', async () => {
    const updated = await publishForm(ctx, 'form-1');
    expect(updated.status).toBe('open');
  });

  /** The existing-form path again, at the moment it actually matters. */
  it('refuses to open a form that never had an external title, naming both fields', async () => {
    rows.form = formRow({ externalTitle: null, pageHeading: null });
    const error = await rejection(publishForm(ctx, 'form-1'));
    expect(error.message).toContain('Settings');
    expect(error.details?.externalTitle).toBeDefined();
    expect(error.details?.pageHeading).toBeDefined();
    expect(updates).toHaveLength(0);
  });

  it('refuses to open a form missing only the page heading', async () => {
    rows.form = formRow({ pageHeading: null });
    const error = await rejection(publishForm(ctx, 'form-1'));
    expect(error.details?.pageHeading).toBeDefined();
    expect(error.details?.externalTitle).toBeUndefined();
  });

  /**
   * `showWelcome` hides the welcome step while keeping the copy, so the copy still has to exist —
   * otherwise switching the step back on reveals a blank screen, which is exactly what the toggle's
   * own help text promises it will not do.
   */
  it('holds the requirement even when the welcome step is switched off', async () => {
    rows.form = formRow({ showWelcome: false, pageHeading: null });
    expect((await rejection(publishForm(ctx, 'form-1'))).details?.pageHeading).toBeDefined();
  });

  /** A seeded portal form sets neither, and pressing Publish on it must not be a dead end. */
  it('opens a portal form with neither field set', async () => {
    rows.form = formRow({ kind: 'portal', externalTitle: null, pageHeading: null });
    const updated = await publishForm(ctx, 'form-1');
    expect(updated.status).toBe('open');
  });
});
