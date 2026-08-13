import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventContext } from '../context';
import type { AppError } from '../errors';
import { isAppError } from '../errors';
import { normalizeAccent } from '../portal-appearance';

/**
 * `S-11`. `portal_theme` was readable and unwritable for the whole life of the project: the portal
 * masthead and the branded email wrapper both read it, the seeds inserted one row per demo event,
 * and no organizer surface, action or route ever wrote one. An audit credited the read path as the
 * feature; on any event nobody seeded, there was nothing to read.
 *
 * So the behaviours worth protecting here are the ones that only appear once a writer exists: the
 * first save has to *create* a row rather than update nothing, a later save must not blank the
 * columns it was not asked about, and an event with no row at all has to keep rendering. The accent
 * is the sharp edge — it is interpolated straight into a `style` attribute on the portal and into an
 * inline style in email, where no CSS custom property and no sanitiser can reach it.
 *
 * Asserted against a recording stand-in for the database, in the shape `settings.test.ts`
 * established, except that this one models the unique constraint on `portal_theme.event_id`: an
 * upsert that cannot tell a create from an update is exactly the bug these tests are here for.
 */

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('../../db/client', () => ({ getDb: () => state.db }));
vi.mock('../mail', () => ({ sendMail: async () => ({ id: 'mail-1', sent: true }) }));

import { getBranding } from './portal';
import {
  getPortalAppearance,
  portalAppearanceInput,
  savePortalAppearance,
  setPortalLogo,
} from './settings';

type ThemeRow = {
  eventId: string;
  logoFileId: string | null;
  accentColor: string | null;
  welcomeMarkdown: string | null;
  supportEmail: string | null;
  updatedAt?: Date;
};

type Recorder = {
  /** At most one row, because `portal_theme.event_id` is unique. Null is the unseeded event. */
  theme: ThemeRow | null;
  inserts: Array<Record<string, unknown>>;
  conflictSets: Array<Record<string, unknown>>;
};

function recorder(): Recorder {
  return { theme: null, inserts: [], conflictSets: [] };
}

/**
 * Chainable and awaitable at any point, like the other service fakes — but this one keeps the row
 * it was given and applies `onConflictDoUpdate` the way Postgres would, so "was this a create or an
 * update?" is a question the test can actually ask.
 */
function fakeDb(rec: Recorder) {
  const insert = () => {
    let pending: Record<string, unknown> = {};
    const builder = {
      values(next: Record<string, unknown>) {
        pending = next;
        rec.inserts.push(next);
        return builder;
      },
      onConflictDoUpdate({ set }: { target: unknown; set: Record<string, unknown> }) {
        rec.conflictSets.push(set);
        if (rec.theme === null) {
          rec.theme = { ...(pending as unknown as ThemeRow) };
        } else {
          rec.theme = { ...rec.theme, ...set };
        }
        return builder;
      },
      returning: () => Promise.resolve(rec.theme ? [{ ...rec.theme }] : []),
    };
    return builder;
  };

  const query = new Proxy(
    {},
    {
      get: (_target, name: string) => ({
        findFirst: async () => (name === 'portalTheme' ? rec.theme : null),
      }),
    },
  );

  return { insert, query };
}

const EVENT_ID = 'event-1';

function context(roles: EventContext['roles'] = ['organizer']): EventContext {
  return {
    actor: {
      userId: 'user-1',
      email: 'chair@example.test',
      name: 'Chair',
      impersonatedByUserId: null,
    },
    eventId: EVENT_ID,
    roles,
  };
}

async function rejection(work: Promise<unknown>): Promise<AppError> {
  try {
    await work;
  } catch (error) {
    if (isAppError(error)) return error;
    throw error;
  }
  throw new Error('expected the call to be refused');
}

function issues(input: Record<string, unknown>): Record<string, string> {
  const parsed = portalAppearanceInput.safeParse(input);
  if (parsed.success) return {};
  return Object.fromEntries(
    parsed.error.issues.map((issue) => [issue.path.join('.') || 'form', issue.message]),
  );
}

let rec: Recorder;

beforeEach(() => {
  rec = recorder();
  state.db = fakeDb(rec);
});

// ---------------------------------------------------------------------------

describe('the accent colour', () => {
  it('takes a six-digit hex and normalises its case, so the stored value is comparable', () => {
    expect(normalizeAccent('#b7391f')).toBe('#B7391F');
  });

  it('expands the three-digit form rather than passing it to an email client to guess at', () => {
    expect(normalizeAccent('#abc')).toBe('#AABBCC');
  });

  it('trims, because a pasted swatch arrives with whitespace', () => {
    expect(normalizeAccent('  #2C4A7C  ')).toBe('#2C4A7C');
  });

  /**
   * The value the seeds had been writing since they were first run. It is not a CSS colour keyword,
   * so it resolved to nothing on the portal and rendered as an invalid inline style in email — the
   * seeded events looked exactly like the unseeded ones, which is part of why nobody noticed the
   * setting had no writer.
   */
  it('refuses a colour name, including the one the seeds used to write', () => {
    expect(normalizeAccent('vermilion')).toBeNull();
    expect(normalizeAccent('red')).toBeNull();
  });

  it('refuses every function and keyword form, which no email client agrees on anyway', () => {
    expect(normalizeAccent('rgb(183, 57, 31)')).toBeNull();
    expect(normalizeAccent('var(--vermilion-500)')).toBeNull();
    expect(normalizeAccent('currentColor')).toBeNull();
  });

  it('refuses alpha, which is where email clients start disagreeing', () => {
    expect(normalizeAccent('#B7391F80')).toBeNull();
  });

  /**
   * This value reaches a `style` attribute in the portal masthead and an inline style in every
   * email the event sends. Nothing downstream escapes it, so the shape check is the escape.
   */
  it('refuses anything that could close the attribute it is interpolated into', () => {
    expect(normalizeAccent('#fff;background:url(https://evil.test/x)')).toBeNull();
    expect(normalizeAccent('red" onload="alert(1)')).toBeNull();
    expect(normalizeAccent('</style><script>alert(1)</script>')).toBeNull();
    expect(normalizeAccent('expression(alert(1))')).toBeNull();
  });

  it('says so in the organizer’s words rather than in a regex', () => {
    expect(issues({ accentColor: 'vermilion' })).toEqual({
      accentColor: 'Use a hex colour like #B7391F',
    });
  });

  it('treats a cleared box as "go back to the default" rather than as an error', () => {
    expect(issues({ accentColor: '' })).toEqual({});
    expect(portalAppearanceInput.parse({ accentColor: '  ' }).accentColor).toBeNull();
  });
});

describe('the support email', () => {
  it('accepts an address and lower-cases it', () => {
    expect(portalAppearanceInput.parse({ supportEmail: 'Speakers@Example.com' }).supportEmail).toBe(
      'speakers@example.com',
    );
  });

  it('refuses something that is not one', () => {
    expect(issues({ supportEmail: 'speakers at example.com' })).toEqual({
      supportEmail: 'That is not an email address',
    });
  });

  it('clears on blank — an event with no support address is an ordinary event', () => {
    expect(portalAppearanceInput.parse({ supportEmail: '' }).supportEmail).toBeNull();
  });
});

describe('the welcome message', () => {
  it('takes five thousand characters', () => {
    expect(issues({ welcomeMarkdown: 'x'.repeat(5000) })).toEqual({});
  });

  it('refuses the five thousand and first', () => {
    expect(issues({ welcomeMarkdown: 'x'.repeat(5001) })).toEqual({
      welcomeMarkdown: 'The welcome message is limited to 5,000 characters',
    });
  });
});

// ---------------------------------------------------------------------------

describe('the first save on an event nobody seeded', () => {
  it('creates the row, because before this nothing in the app ever did', async () => {
    expect(rec.theme).toBeNull();

    const saved = await savePortalAppearance(context(), {
      accentColor: '#2C4A7C',
      welcomeMarkdown: 'Welcome to the Curia.',
      supportEmail: 'clerks@example.test',
    });

    expect(rec.inserts).toHaveLength(1);
    expect(rec.inserts[0]).toMatchObject({
      eventId: EVENT_ID,
      accentColor: '#2C4A7C',
      welcomeMarkdown: 'Welcome to the Curia.',
      supportEmail: 'clerks@example.test',
      logoFileId: null,
    });
    expect(saved.accentColor).toBe('#2C4A7C');
  });

  it('is readable straight afterwards, which is the whole of what was missing', async () => {
    await savePortalAppearance(context(), { supportEmail: 'clerks@example.test' });
    expect(await getPortalAppearance(EVENT_ID)).toMatchObject({
      supportEmail: 'clerks@example.test',
    });
  });
});

describe('a later save', () => {
  beforeEach(() => {
    rec.theme = {
      eventId: EVENT_ID,
      logoFileId: 'file-logo',
      accentColor: '#B7391F',
      welcomeMarkdown: 'Welcome to the Curia.',
      supportEmail: 'clerks@example.test',
    };
  });

  it('updates in place rather than inserting a second row', async () => {
    await savePortalAppearance(context(), { accentColor: '#2F7361' });
    expect(rec.theme).toMatchObject({ eventId: EVENT_ID, accentColor: '#2F7361' });
    expect(rec.conflictSets).toHaveLength(1);
  });

  /**
   * The logo commits on upload and is not part of the form, so the form's save must not mention it.
   * A `set` built from the whole row rather than from the keys the caller sent is how an organizer
   * saves a typo fix and loses the logo they uploaded a minute earlier.
   */
  it('leaves the logo alone, because the form it came from never knew about one', async () => {
    await savePortalAppearance(context(), { accentColor: '#2F7361' });
    expect(rec.conflictSets[0]).not.toHaveProperty('logoFileId');
    expect(rec.theme?.logoFileId).toBe('file-logo');
  });

  it('leaves every other column the caller did not send alone', async () => {
    await savePortalAppearance(context(), { accentColor: '#2F7361' });
    expect(rec.theme).toMatchObject({
      welcomeMarkdown: 'Welcome to the Curia.',
      supportEmail: 'clerks@example.test',
    });
  });

  it('does clear a column that was sent empty — blank is an instruction, not an omission', async () => {
    await savePortalAppearance(context(), { supportEmail: '' });
    expect(rec.theme?.supportEmail).toBeNull();
    expect(rec.theme?.welcomeMarkdown).toBe('Welcome to the Curia.');
  });

  it('refuses the whole save when one field is wrong, rather than half-applying it', async () => {
    const error = await rejection(
      savePortalAppearance(context(), { accentColor: 'chartreuse', supportEmail: 'ok@example.test' }),
    );
    expect(error.details).toMatchObject({ accentColor: 'Use a hex colour like #B7391F' });
    expect(rec.theme?.supportEmail).toBe('clerks@example.test');
  });
});

describe('the logo slot', () => {
  it('creates the row on the first upload, the same as the form does', async () => {
    const { previousFileId } = await setPortalLogo(context(), 'file-new');
    expect(previousFileId).toBeNull();
    expect(rec.theme).toMatchObject({ eventId: EVENT_ID, logoFileId: 'file-new' });
  });

  /** One slot holds one image, so the caller deletes the bytes the replacement made unreachable. */
  it('hands back what it displaced so the old bytes can be collected', async () => {
    rec.theme = {
      eventId: EVENT_ID,
      logoFileId: 'file-old',
      accentColor: '#B7391F',
      welcomeMarkdown: null,
      supportEmail: null,
    };
    const { previousFileId } = await setPortalLogo(context(), 'file-new');
    expect(previousFileId).toBe('file-old');
    expect(rec.theme?.logoFileId).toBe('file-new');
    expect(rec.theme?.accentColor).toBe('#B7391F');
  });

  it('clears without touching the rest of the appearance', async () => {
    rec.theme = {
      eventId: EVENT_ID,
      logoFileId: 'file-old',
      accentColor: '#B7391F',
      welcomeMarkdown: 'Welcome.',
      supportEmail: 'clerks@example.test',
    };
    await setPortalLogo(context(), null);
    expect(rec.theme).toMatchObject({
      logoFileId: null,
      accentColor: '#B7391F',
      welcomeMarkdown: 'Welcome.',
      supportEmail: 'clerks@example.test',
    });
  });
});

describe('who may write it', () => {
  it('refuses a speaker, who reads this configuration and does not set it', async () => {
    const error = await rejection(savePortalAppearance(context(['speaker']), { accentColor: '' }));
    expect(error.code).toBe('forbidden');
    expect(rec.theme).toBeNull();
  });

  it('refuses a reviewer the logo slot too', async () => {
    const error = await rejection(setPortalLogo(context(['reviewer']), 'file-new'));
    expect(error.code).toBe('forbidden');
    expect(rec.theme).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe('an event with no portal_theme row at all', () => {
  it('reads back as unconfigured rather than as a missing event', async () => {
    expect(await getPortalAppearance(EVENT_ID)).toEqual({
      logoFileId: null,
      accentColor: null,
      welcomeMarkdown: null,
      supportEmail: null,
    });
  });

  /**
   * The portal layout renders its own masthead copy when there is no logo, the design system's
   * accent when there is no accent, and a generic footer when there is no support address; the home
   * screen writes its own greeting when there is no welcome. Nothing here may be a placeholder
   * string — the surfaces branch on null, and an empty string is not null.
   */
  it('leaves the speaker portal on its defaults instead of blanking the surface', async () => {
    const branding = await getBranding(EVENT_ID);
    expect(branding).toEqual({
      accentColor: null,
      logoFileId: null,
      welcomeHtml: '',
      supportEmail: null,
    });
  });
});

describe('a row written before there was a writer', () => {
  beforeEach(() => {
    rec.theme = {
      eventId: EVENT_ID,
      logoFileId: null,
      accentColor: 'vermilion',
      welcomeMarkdown: null,
      supportEmail: null,
    };
  });

  it('is normalised on the way out of the organizer’s panel', async () => {
    expect((await getPortalAppearance(EVENT_ID)).accentColor).toBeNull();
  });

  /**
   * Validating on the way in is not enough on its own: the seeds, a migration and any hand-run
   * `UPDATE` all reach this column without passing through the panel, and the value lands in a
   * `style` attribute.
   */
  it('is normalised again on the way into the portal, not trusted because it was stored', async () => {
    expect((await getBranding(EVENT_ID)).accentColor).toBeNull();
  });
});
