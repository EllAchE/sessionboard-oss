import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

/**
 * `AR-51`. The milestone reminder has no state of its own — it does not stamp a row the way
 * `runTaskReminders` stamps `task_assignment.last_reminded_at`. Its entire re-entrancy guard is a
 * lookup in `email_log`, so what that lookup is keyed on *is* the behaviour, and nothing above this
 * level would notice it being keyed on too little: the run would simply go quiet for an event, once,
 * and look like an event with no milestone set.
 *
 * These pin who is mailed, when, and — the case that motivated the guard's shape — that one person
 * running two conferences is reminded about both.
 */

const state = vi.hoisted(() => ({
  events: [] as Array<Record<string, unknown>>,
  organizers: [] as Array<Record<string, unknown>>,
  emailLog: [] as Array<Record<string, string>>,
  templates: [] as Array<Record<string, unknown>>,
  sentMail: [] as Array<{ to: string; subject: string; text: string; eventId: string | null }>,
}));

vi.mock('../../db/client', () => ({ getDb: () => createDb() }));
vi.mock('../mail', () => ({
  sendMail: async (input: (typeof state.sentMail)[number]) => {
    state.sentMail.push(input);
    return { id: `mail-${state.sentMail.length}`, sent: true };
  },
}));
vi.mock('../sms', () => ({
  activeSmsTransportName: () => 'log',
  sendSms: async () => ({ id: 'sms-1', sent: true }),
}));

import {
  emailLog,
  emailTemplate,
  event as eventTable,
  membership,
  notificationPreference,
  portalTheme,
} from '../../db/schema';
import { runEventDeadlineReminders } from './comms';

/**
 * The equality predicates a `where` actually carries, read back off the rendered statement:
 * `{ event_id: 'event-forum', to_email: 'cicero@example.test' }`. This is what lets the fake behave
 * like a scoped query rather than like a table scan — an assertion on the params array alone would
 * pass just as happily if the guard dropped a column and started matching too much.
 *
 * Range predicates (`created_at >=`) are deliberately not modelled; no fixture below seeds a log row
 * old enough for the window to be what excludes it.
 */
function equalities(condition: SQL | undefined): Record<string, string> {
  if (!condition) return {};
  const { sql, params } = new PgDialect().sqlToQuery(condition);
  const found: Record<string, string> = {};
  for (const [, column, position] of sql.matchAll(/"\w+"\."(\w+)" = \$(\d+)/g)) {
    found[column] = String(params[Number(position) - 1]);
  }
  return found;
}

/** A fixture row survives a `where` if every column it models and the query constrains agrees. */
function matching<T extends Record<string, unknown>>(rows: T[], where: Record<string, string>): T[] {
  return rows.filter((row) =>
    Object.entries(where).every(([column, value]) => {
      const held = row[column];
      return held === undefined || String(held) === value;
    }),
  );
}

type Read = { source: unknown; joined: boolean; limited: boolean; where: Record<string, string> };

function rowsFor({ source, limited, where }: Read): unknown[] {
  if (source === eventTable) {
    // Un-limited is the sweep for approaching milestones; limited is `loadCommsContext` fetching one.
    // The sweep's own date predicates are left to the run's second, in-JS window check.
    return matching(state.events, where);
  }
  if (source === portalTheme) return [];
  if (source === membership) return matching(state.organizers, where);
  if (source === emailTemplate) return limited ? matching(state.templates, where) : [];
  if (source === notificationPreference) return [];
  if (source === emailLog) return matching(state.emailLog, where);
  return [];
}

function query() {
  const read: Read = { source: undefined, joined: false, limited: false, where: {} };
  const q: Record<string, unknown> = {
    from: (next: unknown) => {
      read.source = next;
      return q;
    },
    innerJoin: () => {
      read.joined = true;
      return q;
    },
    leftJoin: () => {
      read.joined = true;
      return q;
    },
    where: (condition: SQL | undefined) => {
      read.where = { ...read.where, ...equalities(condition) };
      return q;
    },
    orderBy: () => q,
    limit: () => {
      read.limited = true;
      return q;
    },
    then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(rowsFor(read)).then(resolve, reject),
  };
  return q;
}

function createDb() {
  return {
    select: () => query(),
    insert: () => ({ values: async () => undefined }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  };
}

const NOW = new Date('2026-09-13T09:00:00Z');
/** Inside the three-day window; a day and change out. */
const SOON = new Date('2026-09-14T17:00:00Z');
/** Outside it. */
const LATER = new Date('2026-10-01T17:00:00Z');

function conference(over: Record<string, unknown> & { id: string }) {
  return {
    name: 'Forum Romanum',
    slug: 'forum',
    timezone: 'UTC',
    speakerDeadlineAt: null,
    agendaDeadlineAt: null,
    ...over,
  };
}

function organizer(over: Record<string, unknown> & { event_id: string }) {
  return {
    id: 'user-cicero',
    email: 'cicero@example.test',
    phone: null,
    phoneVerifiedAt: null,
    phoneVerificationTransport: null,
    notifyEmail: true,
    notifySms: false,
    role: 'organizer',
    ...over,
  };
}

/** What `email_log` holds after a send, in the three columns the guard reads. */
function logged(eventId: string, templateKey: string, toEmail = 'cicero@example.test') {
  return { event_id: eventId, to_email: toEmail, template_key: templateKey };
}

beforeEach(() => {
  state.events = [];
  state.organizers = [];
  state.emailLog = [];
  state.templates = [];
  state.sentMail = [];
});

describe('a milestone days away', () => {
  beforeEach(() => {
    state.events = [conference({ id: 'event-forum', speakerDeadlineAt: SOON })];
    state.organizers = [organizer({ event_id: 'event-forum' })];
  });

  it('reminds the organizers', async () => {
    const sent = await runEventDeadlineReminders({ now: NOW });

    expect(sent).toBe(1);
    expect(state.sentMail).toHaveLength(1);
    expect(state.sentMail[0].to).toBe('cicero@example.test');
    expect(state.sentMail[0].eventId).toBe('event-forum');
  });

  it('reminds every organizer, not just the first', async () => {
    state.organizers.push(
      organizer({ event_id: 'event-forum', id: 'user-atticus', email: 'atticus@example.test' }),
    );

    const sent = await runEventDeadlineReminders({ now: NOW });

    expect(sent).toBe(2);
    expect(state.sentMail.map((mail) => mail.to).sort()).toEqual([
      'atticus@example.test',
      'cicero@example.test',
    ]);
  });

  /** `email_log` is the whole guard: no row stamped anywhere else records that this went out. */
  it('sends nothing on a second run, once the first is in email_log', async () => {
    await runEventDeadlineReminders({ now: NOW });
    state.emailLog = [logged('event-forum', 'deadline.speakers')];
    state.sentMail = [];

    const sent = await runEventDeadlineReminders({ now: NOW });

    expect(sent).toBe(0);
    expect(state.sentMail).toEqual([]);
  });

  it('says the date and does not claim anything has locked', async () => {
    await runEventDeadlineReminders({ now: NOW });

    const { text } = state.sentMail[0];
    expect(text).toContain('14 September 2026');
    expect(text).toContain('not a cutoff');
  });

  it('stays quiet when the organizer disabled the template', async () => {
    state.templates = [{ event_id: 'event-forum', key: 'deadline.speakers', enabled: false }];

    const sent = await runEventDeadlineReminders({ now: NOW });

    expect(sent).toBe(0);
    expect(state.sentMail).toEqual([]);
  });
});

describe('the window', () => {
  it('says nothing about a milestone further out than three days', async () => {
    state.events = [conference({ id: 'event-forum', speakerDeadlineAt: LATER })];
    state.organizers = [organizer({ event_id: 'event-forum' })];

    const sent = await runEventDeadlineReminders({ now: NOW });

    expect(sent).toBe(0);
    expect(state.sentMail).toEqual([]);
  });

  it('says nothing about one that has already passed', async () => {
    state.events = [
      conference({ id: 'event-forum', speakerDeadlineAt: new Date('2026-09-12T17:00:00Z') }),
    ];
    state.organizers = [organizer({ event_id: 'event-forum' })];

    const sent = await runEventDeadlineReminders({ now: NOW });

    expect(sent).toBe(0);
    expect(state.sentMail).toEqual([]);
  });

  it('reminds about each of the two milestones separately', async () => {
    state.events = [
      conference({ id: 'event-forum', speakerDeadlineAt: SOON, agendaDeadlineAt: SOON }),
    ];
    state.organizers = [organizer({ event_id: 'event-forum' })];

    const sent = await runEventDeadlineReminders({ now: NOW });

    expect(sent).toBe(2);
    expect(state.sentMail.map((mail) => mail.subject).sort()).toEqual([
      'Your Forum Romanum agenda date is Monday, 14 September 2026',
      'Your Forum Romanum speaker roster date is Monday, 14 September 2026',
    ]);
  });

  it('does not let one event’s agenda mail suppress another milestone', async () => {
    state.events = [
      conference({ id: 'event-forum', speakerDeadlineAt: SOON, agendaDeadlineAt: SOON }),
    ];
    state.organizers = [organizer({ event_id: 'event-forum' })];
    state.emailLog = [logged('event-forum', 'deadline.agenda')];

    const sent = await runEventDeadlineReminders({ now: NOW });

    expect(sent).toBe(1);
    expect(state.sentMail[0].subject).toContain('speaker roster date');
  });
});

/**
 * The reason the guard is event-scoped. A milestone belongs to the edition, so an organizer running
 * two conferences holds two genuinely different `deadline.speakers` dates. Keyed on address and
 * template key alone, the first event's send reads as covering the second, and the second
 * conference's reminder is dropped with nothing recording that it was.
 */
describe('one organizer running two conferences', () => {
  beforeEach(() => {
    state.events = [
      conference({ id: 'event-forum', speakerDeadlineAt: SOON }),
      conference({ id: 'event-curia', name: 'Curia Julia', slug: 'curia', speakerDeadlineAt: SOON }),
    ];
    state.organizers = [
      organizer({ event_id: 'event-forum' }),
      organizer({ event_id: 'event-curia' }),
    ];
  });

  it('reminds them about both', async () => {
    const sent = await runEventDeadlineReminders({ now: NOW });

    expect(sent).toBe(2);
    expect(state.sentMail.map((mail) => mail.eventId).sort()).toEqual([
      'event-curia',
      'event-forum',
    ]);
  });

  it('still reminds them about the second after the first has gone out', async () => {
    state.emailLog = [logged('event-forum', 'deadline.speakers')];

    const sent = await runEventDeadlineReminders({ now: NOW });

    expect(sent).toBe(1);
    expect(state.sentMail).toHaveLength(1);
    expect(state.sentMail[0].eventId).toBe('event-curia');
    expect(state.sentMail[0].subject).toContain('Curia Julia');
  });

  it('honours the sweep’s event filter when a person triggers the run', async () => {
    const sent = await runEventDeadlineReminders({ eventId: 'event-curia', now: NOW });

    expect(sent).toBe(1);
    expect(state.sentMail[0].eventId).toBe('event-curia');
  });
});
