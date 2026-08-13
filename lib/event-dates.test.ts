import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BACKFILL,
  addDays,
  backfillEventWindow,
  canonicalTimezone,
  isValidTimezone,
  requireEventWindow,
  resolveEventWindow,
  utcToLocalInput,
  zonedDateKey,
  zonedTimeToUtc,
} from './event-dates';

describe('isValidTimezone', () => {
  it('accepts the zones an organizer would actually type', () => {
    for (const zone of ['America/Los_Angeles', 'Europe/Rome', 'Asia/Kolkata', 'UTC']) {
      expect(isValidTimezone(zone)).toBe(true);
    }
  });

  it('accepts a three-segment zone', () => {
    expect(isValidTimezone('America/Argentina/Buenos_Aires')).toBe(true);
  });

  it('rejects free text, which is all the column used to hold', () => {
    for (const junk of ['', '   ', 'Pacific Time', 'PST8PDT?', 'Not/AZone']) {
      expect(isValidTimezone(junk)).toBe(false);
    }
  });

  it('rejects an offset and a bare abbreviation, which do not survive a DST boundary', () => {
    expect(isValidTimezone('+05:00')).toBe(false);
    expect(isValidTimezone('EST')).toBe(false);
  });

  it('canonicalises the spelling', () => {
    expect(canonicalTimezone('america/los_angeles')).toBe('America/Los_Angeles');
    expect(canonicalTimezone('Not/AZone')).toBeNull();
  });
});

describe('zonedTimeToUtc', () => {
  it('reads a wall clock in the event timezone, not the machine one', () => {
    expect(zonedTimeToUtc('2026-10-12T09:00', 'America/Los_Angeles')?.toISOString()).toBe(
      '2026-10-12T16:00:00.000Z',
    );
    expect(zonedTimeToUtc('2026-10-12T09:00', 'Europe/Rome')?.toISOString()).toBe(
      '2026-10-12T07:00:00.000Z',
    );
  });

  it('follows the zone across a DST boundary rather than a fixed offset', () => {
    // Los Angeles is UTC-7 in July and UTC-8 in January.
    expect(zonedTimeToUtc('2026-07-15T09:00', 'America/Los_Angeles')?.toISOString()).toBe(
      '2026-07-15T16:00:00.000Z',
    );
    expect(zonedTimeToUtc('2026-01-15T09:00', 'America/Los_Angeles')?.toISOString()).toBe(
      '2026-01-15T17:00:00.000Z',
    );
  });

  it('accepts seconds and a space separator', () => {
    expect(zonedTimeToUtc('2026-10-12 09:30:15', 'UTC')?.toISOString()).toBe(
      '2026-10-12T09:30:15.000Z',
    );
  });

  it('refuses a date-only string — a start needs a time of day', () => {
    expect(zonedTimeToUtc('2026-10-12', 'UTC')).toBeNull();
  });

  it('refuses a day that does not exist', () => {
    expect(zonedTimeToUtc('2026-02-31T09:00', 'UTC')).toBeNull();
    expect(zonedTimeToUtc('2026-13-01T09:00', 'UTC')).toBeNull();
    expect(zonedTimeToUtc('2026-10-12T25:00', 'UTC')).toBeNull();
  });

  it('round-trips through the input format', () => {
    const instant = zonedTimeToUtc('2026-10-12T09:00', 'Australia/Sydney')!;
    expect(utcToLocalInput(instant, 'Australia/Sydney')).toBe('2026-10-12T09:00');
    expect(zonedDateKey(instant, 'Australia/Sydney')).toBe('2026-10-12');
  });

  it('projects the same instant onto different days in different zones', () => {
    const instant = zonedTimeToUtc('2026-10-12T23:00', 'America/Los_Angeles')!;
    expect(zonedDateKey(instant, 'America/Los_Angeles')).toBe('2026-10-12');
    expect(zonedDateKey(instant, 'UTC')).toBe('2026-10-13');
  });
});

describe('addDays', () => {
  it('crosses a month and a leap day', () => {
    expect(addDays('2026-01-30', 3)).toBe('2026-02-02');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('resolveEventWindow', () => {
  it('stores the instants and their date-only projection together', () => {
    const result = resolveEventWindow('America/Los_Angeles', '2026-10-12T09:00', '2026-10-13T17:00');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.window.startsAt.toISOString()).toBe('2026-10-12T16:00:00.000Z');
    expect(result.window.endsAt.toISOString()).toBe('2026-10-14T00:00:00.000Z');
    expect(result.window.startsOn).toBe('2026-10-12');
    expect(result.window.endsOn).toBe('2026-10-13');
  });

  it('canonicalises the zone it was given', () => {
    const result = resolveEventWindow('europe/rome', '2026-10-12T09:00', '2026-10-12T17:00');
    expect(result.ok && result.window.timezone).toBe('Europe/Rome');
  });

  it('refuses an end that is not after the start', () => {
    const backwards = resolveEventWindow('UTC', '2026-10-13T09:00', '2026-10-12T17:00');
    expect(backwards.ok).toBe(false);
    expect(!backwards.ok && backwards.problem.field).toBe('endsAt');

    const identical = resolveEventWindow('UTC', '2026-10-12T09:00', '2026-10-12T09:00');
    expect(identical.ok).toBe(false);
  });

  it('names the field that is wrong', () => {
    expect(resolveEventWindow('Pacific Time', '2026-10-12T09:00', '2026-10-12T17:00')).toMatchObject(
      { ok: false, problem: { field: 'timezone' } },
    );
    expect(resolveEventWindow('UTC', '', '2026-10-12T17:00')).toMatchObject({
      ok: false,
      problem: { field: 'startsAt' },
    });
    expect(resolveEventWindow('UTC', '2026-10-12T09:00', 'soon')).toMatchObject({
      ok: false,
      problem: { field: 'endsAt' },
    });
  });

  it('throws through the seed-facing wrapper', () => {
    expect(() => requireEventWindow('UTC', '2026-10-13T09:00', '2026-10-12T17:00')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Migration 0007
// ---------------------------------------------------------------------------

const NOW = new Date('2026-08-13T12:00:00Z');

describe('backfillEventWindow', () => {
  it('turns a date-only start into 09:00 local on that day', () => {
    const filled = backfillEventWindow(
      { startsOn: '2026-10-12', endsOn: '2026-10-13', timezone: 'America/Los_Angeles' },
      NOW,
    );
    expect(filled.startsAt.toISOString()).toBe('2026-10-12T16:00:00.000Z');
    expect(filled.endsAt.toISOString()).toBe('2026-10-14T00:00:00.000Z');
    expect(filled.startsOn).toBe('2026-10-12');
    expect(filled.endsOn).toBe('2026-10-13');
  });

  it('runs a one-day event from 09:00 to 17:00 when only the start was set', () => {
    const filled = backfillEventWindow(
      { startsOn: '2026-10-12', endsOn: null, timezone: 'UTC' },
      NOW,
    );
    expect(filled.startsAt.toISOString()).toBe('2026-10-12T09:00:00.000Z');
    expect(filled.endsAt.toISOString()).toBe('2026-10-12T17:00:00.000Z');
  });

  it('invents a date thirty days out for a row that never had one', () => {
    const filled = backfillEventWindow({ startsOn: null, endsOn: null, timezone: 'UTC' }, NOW);
    expect(filled.startsOn).toBe('2026-09-12');
    expect(filled.endsOn).toBe('2026-09-12');
    expect(filled.startsAt.toISOString()).toBe('2026-09-12T09:00:00.000Z');
  });

  it('treats junk in the text column as no date at all', () => {
    for (const junk of ['', '   ', 'TBC', '12/10/2026', '2026-02-31']) {
      const filled = backfillEventWindow({ startsOn: junk, endsOn: junk, timezone: 'UTC' }, NOW);
      expect(filled.startsOn).toBe('2026-09-12');
    }
  });

  it('pushes an end that landed before its start out to eight hours', () => {
    const filled = backfillEventWindow(
      { startsOn: '2026-10-12', endsOn: '2026-10-11', timezone: 'UTC' },
      NOW,
    );
    expect(filled.endsAt.getTime() - filled.startsAt.getTime()).toBe(8 * 3_600_000);
    expect(filled.endsOn).toBe('2026-10-12');
  });

  it('falls back to UTC rather than failing on a timezone that is not a zone', () => {
    const filled = backfillEventWindow(
      { startsOn: '2026-10-12', endsOn: '2026-10-12', timezone: 'Pacific Time' },
      NOW,
    );
    expect(filled.timezone).toBe('UTC');
    expect(filled.startsAt.toISOString()).toBe('2026-10-12T09:00:00.000Z');
  });

  it('always produces a projection that matches the instants', () => {
    for (const timezone of ['America/Los_Angeles', 'Europe/Rome', 'Pacific/Kiritimati', null]) {
      const filled = backfillEventWindow({ startsOn: '2026-10-12', endsOn: null, timezone }, NOW);
      expect(filled.startsOn).toBe(zonedDateKey(filled.startsAt, filled.timezone));
      expect(filled.endsOn).toBe(zonedDateKey(filled.endsAt, filled.timezone));
      expect(filled.endsAt.getTime()).toBeGreaterThan(filled.startsAt.getTime());
    }
  });
});

/**
 * The rule above is only worth testing if the migration still implements it. `0007` adds the columns
 * nullable, backfills, and only then adds the constraint — get that order wrong and the migration
 * aborts on any deployment that already has an event.
 */
describe('migration 0007', () => {
  const directory = join(import.meta.dirname, '..', 'db', 'migrations');
  const filename = readdirSync(directory).find((entry) => entry.startsWith('0007_'));
  const raw = readFileSync(join(directory, filename!), 'utf8');
  /** The header comment describes the ordering; only the statements decide it. */
  const sql = raw.replace(/\/\*[\s\S]*?\*\//g, '');

  it('exists', () => {
    expect(filename).toBeDefined();
  });

  it('adds the required columns nullable, so it cannot abort on a populated table', () => {
    for (const column of ['starts_at', 'ends_at']) {
      expect(sql).toContain(`ADD COLUMN "${column}" timestamp with time zone;`);
      expect(sql).not.toContain(`ADD COLUMN "${column}" timestamp with time zone NOT NULL`);
    }
  });

  it('backfills before it constrains', () => {
    const lastUpdate = sql.lastIndexOf('UPDATE "event"');
    const firstConstraint = sql.indexOf('SET NOT NULL');
    expect(lastUpdate).toBeGreaterThan(-1);
    expect(firstConstraint).toBeGreaterThan(lastUpdate);
  });

  it('constrains all four columns', () => {
    for (const column of ['starts_at', 'ends_at', 'starts_on', 'ends_on']) {
      expect(sql).toContain(`ALTER COLUMN "${column}" SET NOT NULL`);
    }
  });

  it('uses the same constants as backfillEventWindow', () => {
    expect(sql).toContain(`' ${String(BACKFILL.startHour).padStart(2, '0')}:00:00'`);
    expect(sql).toContain(`' ${BACKFILL.endHour}:00:00'`);
    expect(sql).toContain(`+ ${BACKFILL.fallbackDays}`);
    expect(sql).toContain(`interval '${BACKFILL.minimumHours} hours'`);
    expect(sql).toContain(`SET "timezone" = '${BACKFILL.fallbackZone}'`);
  });

  it('rewrites the date-only projection from the instants it just resolved', () => {
    expect(sql).toContain('"starts_on" = to_char("starts_at" AT TIME ZONE "timezone"');
    expect(sql).toContain('"ends_on" = to_char("ends_at" AT TIME ZONE "timezone"');
  });
});
