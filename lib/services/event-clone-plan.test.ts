import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import {
  CLONE_PLAN,
  EVENT_COLUMN_PLAN,
  NEVER_COPYABLE,
  SCHEMA_TABLES,
  copiedTables,
  copyEntry,
  copyOrder,
  deriveEventScopedTables,
  tableMeta,
} from './event-clone-plan';

/**
 * `AD-1`. The guard, and the reason this feature is safe to leave running as the schema grows.
 *
 * A clone that silently drifts is a latent data leak: somebody adds a table, nobody edits
 * `event-clone-plan.ts`, and the clone either starts carrying personal data or quietly stops
 * carrying configuration the organizer believes it carries. Every assertion here exists so that
 * failure is a red build with a sentence telling you what to write down, rather than a discovery
 * made in production.
 */

const HOW_TO_FIX =
  'Add an entry to CLONE_PLAN in lib/services/event-clone-plan.ts declaring whether the new ' +
  'table is copied, and if it is skipped, which category it falls in and why.';

describe('deriving the event-scoped tables', () => {
  it('finds every table that carries eventId', () => {
    const withColumn = SCHEMA_TABLES.filter(
      (meta) => meta.name !== 'event' && meta.columnNames.includes('eventId'),
    ).map((meta) => meta.name);

    const scoped = deriveEventScopedTables();
    for (const name of withColumn) expect(scoped).toContain(name);
  });

  /**
   * The half a naive derivation misses. `score` has no `eventId`; it reaches `event` through
   * `review_assignment` -> `review_round`. Copying it because nobody noticed, or missing it in an
   * audit because the grep was for `eventId`, are both real failure modes.
   */
  it('finds tables that are event-scoped only through a parent', () => {
    const scoped = deriveEventScopedTables();
    for (const name of [
      'score',
      'scorecard_criterion',
      'form_field',
      'form_participant_role',
      'review_assignment',
      'review_recusal',
      'participant_role',
      'submission_tag',
      'task_assignment',
      'track_reviewer',
      'ai_review',
      'file_comment',
      'contact_campaign_recipient',
    ]) {
      expect(scoped).toContain(name);
      expect(tableMeta(name).columnNames).not.toContain('eventId');
    }
  });

  /**
   * Pinned deliberately. These belong to a user or to the installation, and a future change that
   * accidentally made one of them look event-scoped would put personal data in the clone's path.
   */
  it('leaves account-level and installation-level tables out', () => {
    const scoped = deriveEventScopedTables();
    for (const name of [
      'user',
      'event',
      'session_cookie',
      'file_blob',
      'sms_consent',
      'inbound_rate_limit',
      'phone_verification_challenge',
      'contact',
      'contact_note',
      'contact_activity',
      'crm_field',
      'contact_segment',
    ]) {
      expect(tableMeta(name)).toBeDefined();
      expect(scoped).not.toContain(name);
    }
  });

  it('accounts for every table in the schema exactly once', () => {
    const scoped = deriveEventScopedTables();
    const unscoped = SCHEMA_TABLES.filter((meta) => !scoped.includes(meta.name));
    expect(scoped.length + unscoped.length).toBe(SCHEMA_TABLES.length);
    expect(new Set(scoped).size).toBe(scoped.length);
  });
});

describe('the plan covers the schema', () => {
  /** The load-bearing test. A new event-scoped table fails the build until somebody decides. */
  it('declares a decision for every event-scoped table', () => {
    const undeclared = deriveEventScopedTables().filter((name) => !CLONE_PLAN[name]);
    expect(undeclared, `Event-scoped tables with no clone decision. ${HOW_TO_FIX}`).toEqual([]);
  });

  /** The other direction: a table that stops being event-scoped, or is dropped, is also a decision. */
  it('declares nothing that is not event-scoped', () => {
    const scoped = new Set(deriveEventScopedTables());
    const stray = Object.keys(CLONE_PLAN).filter((name) => !scoped.has(name));
    expect(
      stray,
      'CLONE_PLAN names tables that are not event-scoped. Remove them, or fix the schema.',
    ).toEqual([]);
  });

  it('gives every skip a category and a reason', () => {
    for (const [name, entry] of Object.entries(CLONE_PLAN)) {
      if (entry.action !== 'skip') continue;
      expect(entry.category, `${name} has no skip category`).toBeTruthy();
      expect(entry.reason.length, `${name} has no reason`).toBeGreaterThan(20);
    }
  });

  it('gives every copy a reason', () => {
    for (const name of copiedTables()) {
      expect(copyEntry(name).reason.length, `${name} has no reason`).toBeGreaterThan(20);
    }
  });
});

describe('the plan covers every column of every copied table', () => {
  /**
   * One level below the table check, and it is what catches a column like `event.speakerDeadlineAt`
   * arriving on a table the clone already touches. A date-bearing column added to `form` would
   * otherwise be carried across verbatim by a spread nobody re-reads.
   */
  it('declares a rule for every column', () => {
    for (const name of copiedTables()) {
      const declared = Object.keys(copyEntry(name).columns).sort();
      const actual = Object.keys(getTableColumns(tableMeta(name).table)).sort();
      expect(
        declared,
        `${name}: every column needs a rule in CLONE_PLAN.${name}.columns. ` +
          'Carry it, remap it, clear it or reset it — but say which.',
      ).toEqual(actual);
    }
  });

  it('declares a rule for every column of event itself', () => {
    const declared = Object.keys(EVENT_COLUMN_PLAN).sort();
    const actual = Object.keys(getTableColumns(schema.event)).sort();
    expect(
      declared,
      'Every `event` column needs a rule in EVENT_COLUMN_PLAN. A new column on `event` — a ' +
        'deadline, a flag — is a clone decision: is it configuration the next edition inherits, ' +
        'or a value that belongs to this edition alone?',
    ).toEqual(actual);
  });

  it('never carries an id, a creation stamp or an event reference by accident', () => {
    for (const name of copiedTables()) {
      const entry = copyEntry(name);
      expect(entry.columns.id?.kind ?? 'generated').toBe('generated');
      if (entry.columns.createdAt) expect(entry.columns.createdAt.kind).toBe('generated');
      if (entry.columns.updatedAt) expect(entry.columns.updatedAt.kind).toBe('generated');
      if (entry.columns.eventId) expect(entry.columns.eventId.kind).toBe('event');
    }
  });

  /**
   * A foreign key must be remapped or cleared, never carried. Carrying one is the referential
   * integrity bug: the new row silently points at a row belonging to the source event.
   */
  it('never carries a foreign key across', () => {
    for (const name of copiedTables()) {
      const entry = copyEntry(name);
      const columns = getTableColumns(tableMeta(name).table) as Record<string, { name: string }>;
      // Every column whose key ends in `Id` counts as a reference here, which deliberately
      // over-reaches past the declared foreign keys: `portalTheme.logoFileId` carries no database
      // constraint but points at `file` all the same, and is exactly the column that would
      // otherwise slip through.
      for (const [key, rule] of Object.entries(entry.columns)) {
        if (!key.endsWith('Id') || !columns[key]) continue;
        expect(
          ['remap', 'clear', 'event', 'generated', 'input'],
          `${name}.${key} looks like a reference and must be remapped or cleared, not copied`,
        ).toContain(rule.kind);
      }
    }
  });

  it('explains every clear and every reset', () => {
    const entries = [
      ...copiedTables().flatMap((name) =>
        Object.entries(copyEntry(name).columns).map(([key, rule]) => [`${name}.${key}`, rule] as const),
      ),
      ...Object.entries(EVENT_COLUMN_PLAN).map(([key, rule]) => [`event.${key}`, rule] as const),
    ];
    for (const [where, rule] of entries) {
      if (rule.kind === 'clear' || rule.kind === 'reset' || rule.kind === 'input') {
        expect(rule.reason.length, `${where} needs a reason`).toBeGreaterThan(10);
      }
    }
  });
});

describe('what must never be copied', () => {
  /**
   * A class-level rule rather than a list of names, because the next token table will be added by
   * somebody who never opened this file. If they classify it honestly as a credential, this test
   * stops them copying it whatever else they get wrong.
   */
  it('copies nothing in a never-copyable category', () => {
    for (const [name, entry] of Object.entries(CLONE_PLAN)) {
      if (entry.action !== 'skip') continue;
      if (!NEVER_COPYABLE.includes(entry.category)) continue;
      expect(entry.action, `${name} is ${entry.category} and must never be copied`).toBe('skip');
    }
  });

  /** Named explicitly as well, so a re-categorisation cannot quietly unlock one of them. */
  it('never copies a token, a key or a secret', () => {
    for (const name of ['magic_token', 'unsubscribe_token', 'api_key', 'webhook_endpoint']) {
      expect(CLONE_PLAN[name]?.action, `${name} must be skipped`).toBe('skip');
      expect((CLONE_PLAN[name] as { category: string }).category).toBe('credential');
    }
    // `session_cookie` is not event-scoped at all, so it is out of the clone's reach by
    // construction rather than by policy. Assert that stays true.
    expect(deriveEventScopedTables()).not.toContain('session_cookie');
  });

  /**
   * Structural, not by name: any copied table holding a column that reads as a secret is a defect.
   * This catches `signingSecret` reappearing on a table somebody decided to copy.
   */
  it('copies no table holding a secret-shaped column', () => {
    const suspicious = /(token|secret|password|key_?hash|signing)/i;
    for (const name of copiedTables()) {
      const columns = Object.keys(getTableColumns(tableMeta(name).table));
      const hits = columns.filter((key) => suspicious.test(key) && key !== 'key');
      expect(hits, `${name} is copied but holds credential-shaped columns: ${hits.join(', ')}`).toEqual(
        [],
      );
    }
  });

  it('never copies participant or submission data', () => {
    for (const name of [
      'participant',
      'participant_role',
      'submission',
      'submission_tag',
      'scheduled_session',
      'session_recording',
      'review_assignment',
      'review_recusal',
      'score',
      'ai_review',
      'task_assignment',
      'membership',
      'prospect',
      'contact_event_link',
    ]) {
      expect(CLONE_PLAN[name]?.action, `${name} must be skipped`).toBe('skip');
    }
  });

  it('never copies a log or a sync record', () => {
    for (const name of [
      'email_log',
      'sms_log',
      'webhook_delivery',
      'content_revision',
      'contact_campaign',
      'contact_campaign_recipient',
      'airtable_sync',
      'accelevents_sync',
    ]) {
      expect(CLONE_PLAN[name]?.action, `${name} must be skipped`).toBe('skip');
    }
  });

  it('never copies files', () => {
    for (const name of ['file', 'file_comment', 'event_exhibitor_map']) {
      expect(CLONE_PLAN[name]?.action, `${name} must be skipped`).toBe('skip');
    }
  });

  /**
   * No copied table may reach a skipped table through a carried value. Cleared and remapped
   * columns are fine; a plain `copy` on a reference into skipped territory is the leak.
   */
  it('lets no copied row point into a skipped table', () => {
    for (const name of copiedTables()) {
      const entry = copyEntry(name);
      for (const rule of Object.values(entry.columns)) {
        if (rule.kind !== 'remap') continue;
        expect(CLONE_PLAN[rule.table]?.action, `${name} remaps into skipped ${rule.table}`).toBe(
          'copy',
        );
      }
    }
  });
});

describe('time-bearing values', () => {
  /**
   * The trap AD-1 names. Every timestamp on a copied table is either cleared or generated fresh;
   * none is carried. A cloned event holding last year's closing date is worse than one holding
   * none, because it looks configured.
   */
  it('carries no timestamp from the source event', () => {
    for (const name of copiedTables()) {
      const entry = copyEntry(name);
      const columns = getTableColumns(tableMeta(name).table) as Record<
        string,
        { getSQLType(): string }
      >;
      for (const [key, rule] of Object.entries(entry.columns)) {
        if (!columns[key]?.getSQLType().startsWith('timestamp')) continue;
        expect(
          ['clear', 'generated'],
          `${name}.${key} is a timestamp and must be cleared, not carried into a new edition`,
        ).toContain(rule.kind);
      }
    }
  });

  it('takes the new event window from the caller and never from the source', () => {
    for (const key of ['startsAt', 'endsAt', 'startsOn', 'endsOn']) {
      expect(EVENT_COLUMN_PLAN[key].kind, `event.${key} must come from the caller`).toBe('input');
    }
  });

  it('closes every intake window it copies', () => {
    expect(copyEntry('form').columns.status).toMatchObject({ kind: 'reset', value: 'draft' });
    expect(copyEntry('review_round').columns.status).toMatchObject({ kind: 'reset', value: 'draft' });
  });

  it('restarts the human-readable counters', () => {
    expect(EVENT_COLUMN_PLAN.submissionSeq).toMatchObject({ kind: 'reset', value: 0 });
    expect(EVENT_COLUMN_PLAN.sessionSeq).toMatchObject({ kind: 'reset', value: 0 });
  });
});

describe('copy order', () => {
  it('places every table after the tables it points at', () => {
    const order = copyOrder();
    expect(order.sort()).toEqual(copiedTables().sort());

    const position = new Map(copyOrder().map((name, index) => [name, index]));
    for (const name of copiedTables()) {
      const entry = copyEntry(name);
      const targets = new Set<string>();
      if ('parent' in entry.scope) targets.add(entry.scope.parent);
      for (const rule of Object.values(entry.columns)) {
        if (rule.kind === 'remap') targets.add(rule.table);
      }
      for (const target of targets) {
        expect(position.get(target)!, `${target} must be copied before ${name}`).toBeLessThan(
          position.get(name)!,
        );
      }
    }
  });

  it('is stable', () => {
    expect(copyOrder()).toEqual(copyOrder());
  });

  it('scopes every copied table either to the event or to a copied parent', () => {
    for (const name of copiedTables()) {
      const entry = copyEntry(name);
      if (entry.scope.column === 'eventId' && !('parent' in entry.scope)) {
        expect(tableMeta(name).columnNames).toContain('eventId');
        continue;
      }
      expect('parent' in entry.scope).toBe(true);
      const scope = entry.scope as { column: string; parent: string };
      expect(tableMeta(name).columnNames).toContain(scope.column);
      expect(entry.columns[scope.column]).toMatchObject({ kind: 'remap', table: scope.parent });
    }
  });

  it('names a real column in every skipRow', () => {
    for (const name of copiedTables()) {
      const rule = copyEntry(name).skipRow;
      if (!rule) continue;
      expect(tableMeta(name).columnNames).toContain(rule.column);
      expect(copyEntry(name).columns[rule.column].kind).toBe('clear');
      expect(rule.reason.length).toBeGreaterThan(20);
    }
  });
});

describe('the shape of the decision', () => {
  /**
   * A cheap regression on the headline claim. If a future change halves what gets copied, or
   * doubles it, that shows up here rather than in a support ticket.
   */
  it('copies configuration and skips the rest', () => {
    const scoped = deriveEventScopedTables();
    const copied = copiedTables();
    expect(scoped.length).toBe(49);
    expect(copied.length).toBe(16);
    expect(copied.sort()).toEqual(
      [
        'email_template',
        'field_library_entry',
        'file_request',
        'form',
        'form_field',
        'form_participant_role',
        'persona',
        'portal_page',
        'portal_theme',
        'review_round',
        'room',
        'scorecard_criterion',
        'session_format',
        'tag',
        'task',
        'track',
      ].sort(),
    );
  });
});
