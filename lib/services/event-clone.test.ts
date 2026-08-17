import { getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema';
import type { EventContext } from '../context';
import { isAppError, type AppError } from '../errors';
import { CLONE_PLAN, copiedTables } from './event-clone-plan';
import { cloneEvent, suggestNextEditionName, suggestNextEditionWindow } from './event-clone';

/**
 * `AD-1`. What the executor actually writes.
 *
 * `event-clone-plan.test.ts` proves the declaration is complete and self-consistent; this file
 * proves the code obeys it. Both are needed: a perfect plan executed by a spread statement copies
 * everything, and a careful executor reading a plan with a hole in it copies a token.
 *
 * Asserted against the recording stand-in `sponsors.test.ts` established, extended with
 * `transaction` and with an `insert … returning` that mints ids — because remapping is the thing
 * most worth checking, and a fake that hands back nothing cannot show a child row finding its new
 * parent.
 */

type Insert = { table: string; rows: Record<string, unknown>[] };

type Recorder = {
  rows: Map<string, Record<string, unknown>[]>;
  inserts: Insert[];
  /** Table name -> error to throw on insert, for the rollback tests. */
  failOn: Map<string, Error>;
  findFirst: Map<string, unknown>;
  rolledBack: boolean;
  committed: boolean;
};

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('../../db/client', () => ({ getDb: () => state.db }));

function recorder(): Recorder {
  return {
    rows: new Map(),
    inserts: [],
    failOn: new Map(),
    findFirst: new Map(),
    rolledBack: false,
    committed: false,
  };
}

function handle(rec: Recorder) {
  let minted = 0;

  const select = () => {
    let table = '';
    const builder = {
      from(next: PgTable) {
        table = getTableName(next);
        return builder;
      },
      where: () => builder,
      orderBy: () => builder,
      innerJoin: () => builder,
      then: (ok: (value: unknown[]) => unknown, err?: (reason: unknown) => unknown) =>
        Promise.resolve(rec.rows.get(table) ?? []).then(ok, err),
    };
    return builder;
  };

  const insert = (target: PgTable) => {
    const table = getTableName(target);
    let staged: Record<string, unknown>[] = [];
    const builder = {
      values(values: Record<string, unknown> | Record<string, unknown>[]) {
        staged = Array.isArray(values) ? values : [values];
        const failure = rec.failOn.get(table);
        if (failure) throw failure;
        rec.inserts.push({ table, rows: staged });
        return builder;
      },
      onConflictDoNothing: () => builder,
      returning: async () => staged.map((row) => ({ ...row, id: row.id ?? `${table}-new-${++minted}` })),
      then: (ok: (value: unknown) => unknown, err?: (reason: unknown) => unknown) =>
        Promise.resolve(null).then(ok, err),
    };
    return builder;
  };

  const query = new Proxy(
    {},
    {
      get: (_t, name: string) => ({
        findFirst: async () => rec.findFirst.get(name) ?? null,
      }),
    },
  );

  return { select, insert, query };
}

function fakeDb(rec: Recorder) {
  const base = handle(rec);
  return {
    ...base,
    async transaction<T>(work: (tx: ReturnType<typeof handle>) => Promise<T>): Promise<T> {
      try {
        const result = await work(handle(rec));
        rec.committed = true;
        return result;
      } catch (error) {
        rec.rolledBack = true;
        throw error;
      }
    },
  };
}

const SOURCE_ID = 'event-source';

function context(roles: EventContext['roles'] = ['organizer']): EventContext {
  return {
    actor: {
      userId: 'user-1',
      email: 'chair@forum.test',
      name: 'Chair',
      impersonatedByUserId: null,
    },
    eventId: SOURCE_ID,
    roles,
  };
}

const SOURCE_EVENT = {
  id: SOURCE_ID,
  slug: 'cascadia-2026',
  name: 'Cascadia Systems Conf 2026',
  tagline: 'Systems, out west',
  descriptionMarkdown: '# Welcome',
  eventType: 'Conference',
  theme: 'Durability',
  timezone: 'America/Los_Angeles',
  startsAt: new Date('2026-10-12T16:00:00.000Z'),
  endsAt: new Date('2026-10-13T00:00:00.000Z'),
  startsOn: '2026-10-12',
  endsOn: '2026-10-12',
  websiteUrl: 'https://cascadia.example',
  venueName: 'Benaroya Hall',
  venueAddress: '200 University St',
  logoFileId: 'file-logo',
  bannerFileId: 'file-banner',
  ownerUserId: 'user-original',
  submissionSeq: 214,
  sessionSeq: 61,
  agendaConflictPolicy: 'block',
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const INPUT = { name: 'Cascadia Systems Conf 2027', startsAt: '2027-10-11T09:00', endsAt: '2027-10-11T17:00' };

let rec: Recorder;

beforeEach(() => {
  rec = recorder();
  rec.findFirst.set('event', SOURCE_EVENT);
  state.db = fakeDb(rec);
});

/** `findFirst` answers both the source lookup and the slug-collision check, so seed a miss for the second. */
function noSlugCollision() {
  let call = 0;
  rec.findFirst.set('event', SOURCE_EVENT);
  const proxy = new Proxy(rec.findFirst, {
    get(target, key) {
      if (key === 'get') {
        return (name: string) => (name === 'event' && call++ > 0 ? null : target.get(name));
      }
      return Reflect.get(target, key);
    },
  });
  rec.findFirst = proxy as Recorder['findFirst'];
}

function rowsOf(table: string): Record<string, unknown>[] {
  return rec.inserts.filter((entry) => entry.table === table).flatMap((entry) => entry.rows);
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

beforeEach(() => {
  noSlugCollision();
});

describe('who may clone', () => {
  it('refuses a reviewer', async () => {
    const error = await rejection(cloneEvent(context(['reviewer']), INPUT));
    expect(error.code).toBe('forbidden');
    expect(error.message).toContain('event:manage');
    expect(rec.inserts).toEqual([]);
  });

  it('refuses a speaker', async () => {
    expect((await rejection(cloneEvent(context(['speaker']), INPUT))).code).toBe('forbidden');
    expect(rec.inserts).toEqual([]);
  });

  it('allows an organizer', async () => {
    const result = await cloneEvent(context(), INPUT);
    expect(result.eventId).toBeTruthy();
  });
});

describe('the new event row', () => {
  it('takes its identity and window from the caller, not from the source', async () => {
    await cloneEvent(context(), INPUT);
    const [row] = rowsOf('event');

    expect(row.name).toBe('Cascadia Systems Conf 2027');
    expect(row.slug).toBe('cascadia-systems-conf-2027');
    expect(row.startsOn).toBe('2027-10-11');
    expect(row.endsOn).toBe('2027-10-11');
    expect(row.startsAt).not.toEqual(SOURCE_EVENT.startsAt);
    expect(row.ownerUserId).toBe('user-1');
  });

  it('carries the configuration half of the metadata', async () => {
    await cloneEvent(context(), INPUT);
    const [row] = rowsOf('event');

    expect(row.tagline).toBe(SOURCE_EVENT.tagline);
    expect(row.descriptionMarkdown).toBe(SOURCE_EVENT.descriptionMarkdown);
    expect(row.eventType).toBe(SOURCE_EVENT.eventType);
    expect(row.theme).toBe(SOURCE_EVENT.theme);
    expect(row.venueName).toBe(SOURCE_EVENT.venueName);
    expect(row.websiteUrl).toBe(SOURCE_EVENT.websiteUrl);
    expect(row.agendaConflictPolicy).toBe('block');
    expect(row.timezone).toBe('America/Los_Angeles');
  });

  it('drops the file references and restarts the counters', async () => {
    await cloneEvent(context(), INPUT);
    const [row] = rowsOf('event');

    expect(row.logoFileId).toBeNull();
    expect(row.bannerFileId).toBeNull();
    expect(row.submissionSeq).toBe(0);
    expect(row.sessionSeq).toBe(0);
  });

  it('never writes an id or a timestamp of its own', async () => {
    await cloneEvent(context(), INPUT);
    const [row] = rowsOf('event');
    expect(row).not.toHaveProperty('id');
    expect(row).not.toHaveProperty('createdAt');
    expect(row).not.toHaveProperty('updatedAt');
  });

  it('makes the cloning organizer an organizer on the copy', async () => {
    await cloneEvent(context(), INPUT);
    expect(rowsOf('membership')).toEqual([
      { userId: 'user-1', eventId: 'event-new-1', role: 'organizer' },
    ]);
  });

  it('refuses a slug that is already taken', async () => {
    rec.findFirst = recorder().findFirst;
    rec.findFirst.set('event', SOURCE_EVENT);
    const error = await rejection(cloneEvent(context(), INPUT));
    expect(error.code).toBe('conflict');
    expect(rowsOf('event')).toEqual([]);
  });

  it('refuses a start that lands after its end', async () => {
    const error = await rejection(
      cloneEvent(context(), { ...INPUT, startsAt: '2027-10-12T09:00', endsAt: '2027-10-11T17:00' }),
    );
    expect(error.code).toBe('invalid');
    expect(rec.inserts).toEqual([]);
  });
});

describe('configuration comes across', () => {
  beforeEach(() => {
    rec.rows.set('track', [
      { id: 'track-1', eventId: SOURCE_ID, name: 'Platform', color: '#123456', description: null, position: 0, createdAt: new Date() },
    ]);
    rec.rows.set('room', [
      { id: 'room-1', eventId: SOURCE_ID, name: 'Nordstrom Recital', capacity: 540, floor: '2', position: 0, createdAt: new Date() },
    ]);
    rec.rows.set('email_template', [
      {
        id: 'tpl-1', eventId: SOURCE_ID, key: 'submission.accepted', name: 'Accepted', subject: 'You are in',
        bodyMarkdown: 'Congratulations', smsBody: null, enabled: true, attachIcs: true,
        createdAt: new Date(), updatedAt: new Date(),
      },
    ]);
  });

  it('rescopes every copied row to the new event', async () => {
    await cloneEvent(context(), INPUT);
    for (const table of ['track', 'room', 'email_template']) {
      for (const row of rowsOf(table)) expect(row.eventId).toBe('event-new-1');
    }
  });

  it('carries the values that make the configuration worth copying', async () => {
    await cloneEvent(context(), INPUT);
    expect(rowsOf('track')[0]).toMatchObject({ name: 'Platform', color: '#123456', position: 0 });
    expect(rowsOf('room')[0]).toMatchObject({ name: 'Nordstrom Recital', capacity: 540, floor: '2' });
    expect(rowsOf('email_template')[0]).toMatchObject({
      key: 'submission.accepted',
      subject: 'You are in',
      bodyMarkdown: 'Congratulations',
      attachIcs: true,
    });
  });

  it('reports what it wrote', async () => {
    const result = await cloneEvent(context(), INPUT);
    expect(result.copied).toEqual({ track: 1, room: 1, email_template: 1 });
  });

  it('omits tables that had nothing to copy', async () => {
    const result = await cloneEvent(context(), INPUT);
    expect(result.copied).not.toHaveProperty('form');
  });
});

describe('time-bearing values are not carried', () => {
  beforeEach(() => {
    rec.rows.set('form', [
      {
        id: 'form-1', eventId: SOURCE_ID, kind: 'cfp', targetType: 'abstract', collectsParticipants: true,
        name: 'Call for orators', slug: 'speak', externalTitle: null, pageHeading: null, showWelcome: true,
        status: 'open', introMarkdown: 'Tell us', maxParticipants: 4,
        opensAt: new Date('2026-02-01T00:00:00.000Z'), closesAt: new Date('2026-05-01T00:00:00.000Z'),
        maxSubmissionsPerUser: 3, allowDrafts: true, notifyEmails: ['chair@forum.test'],
        confirmationSubject: 'Got it', confirmationBodyMarkdown: 'Thanks',
        createdAt: new Date(), updatedAt: new Date(),
      },
    ]);
    rec.rows.set('review_round', [
      {
        id: 'round-1', eventId: SOURCE_ID, name: 'First hearing', position: 0, status: 'closed',
        decisionQueueBarTenths: 35, blindUntilClose: true, anonymized: false,
        opensAt: new Date('2026-05-02T00:00:00.000Z'), closesAt: new Date('2026-06-01T00:00:00.000Z'),
        createdAt: new Date(),
      },
    ]);
  });

  it("clears the form's call window and reopens it as a draft", async () => {
    await cloneEvent(context(), INPUT);
    const [form] = rowsOf('form');

    expect(form.opensAt).toBeNull();
    expect(form.closesAt).toBeNull();
    expect(form.status).toBe('draft');
    // The rest of the form is the whole point of cloning it.
    expect(form).toMatchObject({ name: 'Call for orators', slug: 'speak', maxParticipants: 4, allowDrafts: true });
    expect(form.notifyEmails).toEqual(['chair@forum.test']);
  });

  it('clears the review window and reopens the round as a draft', async () => {
    await cloneEvent(context(), INPUT);
    const [round] = rowsOf('review_round');

    expect(round.opensAt).toBeNull();
    expect(round.closesAt).toBeNull();
    expect(round.status).toBe('draft');
    expect(round).toMatchObject({ name: 'First hearing', decisionQueueBarTenths: 35, blindUntilClose: true });
  });

  it('clears task due dates', async () => {
    rec.rows.set('task', [
      {
        id: 'task-1', eventId: SOURCE_ID, name: 'Upload your slides', descriptionMarkdown: null,
        kind: 'file_upload', audience: 'accepted_participants', scope: 'contact', submissionId: null,
        formId: null, fileRequestId: null, linkUrl: null, dueAt: new Date('2026-09-01T00:00:00.000Z'),
        required: true, position: 0, reminderDaysBefore: [7, 1], reminderDaysAfterSend: 3, createdAt: new Date(),
      },
    ]);
    await cloneEvent(context(), INPUT);
    const [task] = rowsOf('task');

    expect(task.dueAt).toBeNull();
    expect(task).toMatchObject({ name: 'Upload your slides', kind: 'file_upload', required: true });
    expect(task.reminderDaysBefore).toEqual([7, 1]);
  });
});

describe('referential integrity of the remapped ids', () => {
  beforeEach(() => {
    rec.rows.set('field_library_entry', [
      { id: 'lib-1', eventId: SOURCE_ID, key: 'bio', label: 'Biography', type: 'long_text', helpText: null, options: null, createdAt: new Date() },
    ]);
    rec.rows.set('form', [
      {
        id: 'form-1', eventId: SOURCE_ID, kind: 'cfp', targetType: 'abstract', collectsParticipants: true,
        name: 'Call', slug: 'speak', externalTitle: null, pageHeading: null, showWelcome: true,
        status: 'open', introMarkdown: null, maxParticipants: null, opensAt: null, closesAt: null,
        maxSubmissionsPerUser: null, allowDrafts: true, notifyEmails: [], confirmationSubject: null,
        confirmationBodyMarkdown: null, createdAt: new Date(), updatedAt: new Date(),
      },
    ]);
    rec.rows.set('form_field', [
      {
        id: 'ff-1', formId: 'form-1', position: 0, step: 0, type: 'long_text', key: 'bio', builtinKey: null,
        label: 'Biography', helpText: null, placeholder: null, required: true, entity: 'participant',
        options: null, showIf: null, minLength: null, maxLength: 2000, charLimitGroup: null,
        libraryEntryId: 'lib-1', createdAt: new Date(),
      },
    ]);
    rec.rows.set('review_round', [
      {
        id: 'round-1', eventId: SOURCE_ID, name: 'First hearing', position: 0, status: 'open',
        decisionQueueBarTenths: 35, blindUntilClose: true, anonymized: false, opensAt: null,
        closesAt: null, createdAt: new Date(),
      },
    ]);
    rec.rows.set('scorecard_criterion', [
      { id: 'crit-1', reviewRoundId: 'round-1', label: 'Relevance', description: null, weight: 2, maxScore: 5, position: 0 },
    ]);
    rec.rows.set('file_request', [
      { id: 'req-1', eventId: SOURCE_ID, label: 'Slides', helpText: null, acceptedTypes: ['.pdf'], maxSizeMb: 25, allowMultiple: false, createdAt: new Date() },
    ]);
  });

  it('points a copied field at the copied form, never the source form', async () => {
    await cloneEvent(context(), INPUT);
    const formId = (rowsOf('form')[0] as { id?: string }).id ?? 'form-new';
    const [field] = rowsOf('form_field');

    expect(field.formId).not.toBe('form-1');
    expect(field.formId).toMatch(/^form-new-/);
    expect(formId).toBeDefined();
  });

  it('points a copied field at the copied library entry', async () => {
    await cloneEvent(context(), INPUT);
    const [field] = rowsOf('form_field');
    expect(field.libraryEntryId).not.toBe('lib-1');
    expect(field.libraryEntryId).toMatch(/^field_library_entry-new-/);
  });

  it('points a copied criterion at the copied round', async () => {
    await cloneEvent(context(), INPUT);
    const [criterion] = rowsOf('scorecard_criterion');
    expect(criterion.reviewRoundId).not.toBe('round-1');
    expect(criterion.reviewRoundId).toMatch(/^review_round-new-/);
  });

  it('points a copied task at the copied form and file request', async () => {
    rec.rows.set('task', [
      {
        id: 'task-1', eventId: SOURCE_ID, name: 'Upload slides', descriptionMarkdown: null, kind: 'file_upload',
        audience: 'accepted_participants', scope: 'contact', submissionId: null, formId: 'form-1',
        fileRequestId: 'req-1', linkUrl: null, dueAt: null, required: true, position: 0,
        reminderDaysBefore: [], reminderDaysAfterSend: null, createdAt: new Date(),
      },
    ]);
    await cloneEvent(context(), INPUT);
    const [task] = rowsOf('task');

    expect(task.formId).toMatch(/^form-new-/);
    expect(task.fileRequestId).toMatch(/^file_request-new-/);
  });

  it('leaves no copied row holding a source id', async () => {
    await cloneEvent(context(), INPUT);
    const sourceIds = new Set(
      [...rec.rows.values()].flat().map((row) => row.id).filter((id): id is string => typeof id === 'string'),
    );
    sourceIds.add(SOURCE_ID);

    for (const entry of rec.inserts) {
      for (const row of entry.rows) {
        for (const [key, value] of Object.entries(row)) {
          if (typeof value !== 'string') continue;
          expect(sourceIds.has(value), `${entry.table}.${key} still points at the source event`).toBe(false);
        }
      }
    }
  });
});

describe('nothing that should not cross, crosses', () => {
  beforeEach(() => {
    // Seed every event-scoped table with a row, whether the plan copies it or not. A table the
    // executor is not supposed to read has rows waiting for it all the same.
    for (const name of Object.keys(CLONE_PLAN)) {
      rec.rows.set(name, [{ id: `${name}-source`, eventId: SOURCE_ID, tokenHash: 'secret', signingSecret: 'shh' }]);
    }
    rec.rows.set('task', [
      {
        id: 'task-pinned', eventId: SOURCE_ID, name: 'Confirm SESS-4', descriptionMarkdown: null, kind: 'acknowledge',
        audience: 'accepted_participants', scope: 'submission', submissionId: 'sub-1', formId: null,
        fileRequestId: null, linkUrl: null, dueAt: null, required: true, position: 0,
        reminderDaysBefore: [], reminderDaysAfterSend: null, createdAt: new Date(),
      },
      {
        id: 'task-general', eventId: SOURCE_ID, name: 'Send a headshot', descriptionMarkdown: null, kind: 'file_upload',
        audience: 'accepted_participants', scope: 'contact', submissionId: null, formId: null,
        fileRequestId: null, linkUrl: null, dueAt: null, required: true, position: 1,
        reminderDaysBefore: [], reminderDaysAfterSend: null, createdAt: new Date(),
      },
    ]);
  });

  it('writes only to tables the plan copies', async () => {
    await cloneEvent(context(), INPUT);
    const allowed = new Set([...copiedTables(), 'event', 'membership']);
    for (const entry of rec.inserts) {
      expect(allowed.has(entry.table), `${entry.table} was written but is not a copied table`).toBe(true);
    }
  });

  /**
   * `membership` is the one exception, and it is not an exception to the rule it looks like: no
   * membership row is *copied*: one is minted for the organizer who ran the clone, because an
   * event nobody can administer is a dead end. The assertion below is therefore "no source row
   * crossed", which is the property that matters, rather than "the table was untouched".
   */
  it('copies no skipped table, and mints only the caller their own membership', async () => {
    await cloneEvent(context(), INPUT);
    const written = new Set(rec.inserts.map((entry) => entry.table));
    for (const [name, entry] of Object.entries(CLONE_PLAN)) {
      if (entry.action !== 'skip' || name === 'membership') continue;
      expect(written.has(name), `${name} is skipped but was written`).toBe(false);
    }

    const memberships = rowsOf('membership');
    expect(memberships).toHaveLength(1);
    expect(memberships[0]).toMatchObject({ userId: 'user-1', role: 'organizer' });
    expect(memberships[0].id).toBeUndefined();
  });

  it('never touches a token, key or secret table even with rows waiting', async () => {
    await cloneEvent(context(), INPUT);
    const written = new Set(rec.inserts.map((entry) => entry.table));
    for (const name of ['magic_token', 'unsubscribe_token', 'api_key', 'webhook_endpoint', 'session_cookie']) {
      expect(written.has(name)).toBe(false);
    }
  });

  it('never touches participant or submission data even with rows waiting', async () => {
    await cloneEvent(context(), INPUT);
    const written = new Set(rec.inserts.map((entry) => entry.table));
    for (const name of ['participant', 'participant_role', 'submission', 'scheduled_session', 'score', 'review_assignment', 'task_assignment']) {
      expect(written.has(name)).toBe(false);
    }
  });

  it('leaves behind a task that is pinned to one talk, and keeps the rest', async () => {
    await cloneEvent(context(), INPUT);
    const tasks = rowsOf('task');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].name).toBe('Send a headshot');
    expect(tasks[0].submissionId).toBeNull();
  });

  it('writes no secret-shaped value anywhere', async () => {
    await cloneEvent(context(), INPUT);
    for (const entry of rec.inserts) {
      for (const value of Object.values(entry.rows[0] ?? {})) {
        expect(value).not.toBe('secret');
        expect(value).not.toBe('shh');
      }
    }
  });
});

describe('failing halfway', () => {
  beforeEach(() => {
    rec.rows.set('track', [
      { id: 'track-1', eventId: SOURCE_ID, name: 'Platform', color: null, description: null, position: 0, createdAt: new Date() },
    ]);
    rec.rows.set('room', [
      { id: 'room-1', eventId: SOURCE_ID, name: 'Hall', capacity: null, floor: null, position: 0, createdAt: new Date() },
    ]);
  });

  /**
   * The worst available outcome is a half-cloned event: it shows up in the switcher, looks real,
   * and is missing whichever tables came after the failure with nothing to say so.
   */
  it('rolls the whole clone back when one table fails', async () => {
    rec.failOn.set('room', new Error('constraint violation on room'));
    await expect(cloneEvent(context(), INPUT)).rejects.toThrow('constraint violation on room');
    expect(rec.rolledBack).toBe(true);
    expect(rec.committed).toBe(false);
  });

  it('rolls back even when the failure is on the event row itself', async () => {
    rec.failOn.set('event', new Error('duplicate key value violates unique constraint'));
    await expect(cloneEvent(context(), INPUT)).rejects.toThrow('duplicate key');
    expect(rec.rolledBack).toBe(true);
  });

  it('commits nothing outside the transaction', async () => {
    rec.failOn.set('track', new Error('boom'));
    await expect(cloneEvent(context(), INPUT)).rejects.toThrow('boom');
    // Every write the service makes is inside `transaction`, so a rollback is total. Nothing here
    // touches object storage, sends mail or fires a webhook, so there is nothing to compensate.
    expect(rec.committed).toBe(false);
  });

  it('commits when nothing fails', async () => {
    await cloneEvent(context(), INPUT);
    expect(rec.committed).toBe(true);
    expect(rec.rolledBack).toBe(false);
  });
});

describe('what the organizer is told', () => {
  it('says plainly that nobody came across', async () => {
    const result = await cloneEvent(context(), INPUT);
    expect(result.notes.join(' ')).toMatch(/nobody was carried over/i);
  });

  it('names the work left to redo', async () => {
    rec.rows.set('form', [
      {
        id: 'form-1', eventId: SOURCE_ID, kind: 'cfp', targetType: 'abstract', collectsParticipants: true,
        name: 'Call', slug: 'speak', externalTitle: null, pageHeading: null, showWelcome: true, status: 'open',
        introMarkdown: null, maxParticipants: null, opensAt: null, closesAt: null, maxSubmissionsPerUser: null,
        allowDrafts: true, notifyEmails: [], confirmationSubject: null, confirmationBodyMarkdown: null,
        createdAt: new Date(), updatedAt: new Date(),
      },
    ]);
    const result = await cloneEvent(context(), INPUT);
    const text = result.notes.join(' ');
    expect(text).toMatch(/drafts/i);
    expect(text).toMatch(/re-?upload/i);
    expect(text).toMatch(/API keys/i);
  });
});

describe('what the duplicate form suggests', () => {
  it('bumps a trailing year', () => {
    expect(suggestNextEditionName('Cascadia Systems Conf 2026')).toBe('Cascadia Systems Conf 2027');
    expect(suggestNextEditionName('PyCon US 2026')).toBe('PyCon US 2027');
    expect(suggestNextEditionName('Forum 2029')).toBe('Forum 2030');
  });

  it('bumps a year that is followed by punctuation rather than ending the string', () => {
    expect(suggestNextEditionName('Cascadia 2026!')).toBe('Cascadia 2027!');
  });

  it('leaves a year in the middle alone', () => {
    expect(suggestNextEditionName('Since 2019 Conference')).toBe('Since 2019 Conference (copy)');
  });

  it('falls back to a suffix rather than guessing', () => {
    expect(suggestNextEditionName('The Forum')).toBe('The Forum (copy)');
  });

  it('does not mistake a four-digit number for a year', () => {
    expect(suggestNextEditionName('Room 1400')).toBe('Room 1400 (copy)');
  });

  /** 52 weeks, so a Monday-to-Wednesday conference stays Monday-to-Wednesday. */
  it('moves the window on by 364 days, preserving the weekday and the time of day', () => {
    const next = suggestNextEditionWindow('2026-10-12T09:00', '2026-10-14T17:00');
    expect(next).toEqual({ startsAt: '2027-10-11T09:00', endsAt: '2027-10-13T17:00' });
    expect(new Date('2026-10-12').getUTCDay()).toBe(new Date('2027-10-11').getUTCDay());
  });

  it('crosses a leap day without drifting', () => {
    expect(suggestNextEditionWindow('2028-02-28T09:00', '2028-02-29T17:00')).toEqual({
      startsAt: '2029-02-26T09:00',
      endsAt: '2029-02-27T17:00',
    });
  });

  /** The suggestion is a starting point in a form; the service still demands an explicit window. */
  it('is never used by the service itself', async () => {
    const error = await rejection(
      cloneEvent(context(), { name: 'Cascadia 2027', startsAt: '', endsAt: '' }),
    );
    expect(error.code).toBe('invalid');
    expect(rec.inserts).toEqual([]);
  });
});

describe('the executor stays in step with the schema', () => {
  /** Cheap insurance that the plan's table names still resolve against `db/schema.ts`. */
  it('resolves every copied table to a real drizzle table', () => {
    const known = new Set<string>();
    for (const value of Object.values(schema)) {
      if (is(value as never, PgTable)) known.add(getTableName(value as PgTable));
    }
    for (const name of copiedTables()) expect(known.has(name)).toBe(true);
  });
});
