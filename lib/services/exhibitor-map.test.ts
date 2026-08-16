import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { EventContext } from '@/lib/context';
import { isAppError } from '@/lib/errors';

const state = vi.hoisted(() => ({ db: null as unknown, storage: null as unknown }));
vi.mock('@/db/client', () => ({ getDb: () => state.db }));
vi.mock('@/lib/storage', () => ({ getStorage: () => state.storage }));

import {
  readPublicExhibitorMap,
  uploadExhibitorMap,
  validateExhibitorMapUpload,
} from './exhibitor-map';

const VALID = {
  filename: 'floor.pdf',
  contentType: 'application/pdf',
  sizeBytes: 12,
  bytes: new TextEncoder().encode('%PDF-1.7\nmap'),
};

const speaker: EventContext = {
  actor: {
    userId: 'speaker-1',
    email: 'speaker@example.test',
    name: 'Speaker',
    impersonatedByUserId: null,
  },
  eventId: 'event-1',
  roles: ['speaker'],
};

describe('exhibitor map uploads', () => {
  it('accepts only PDF metadata backed by actual PDF bytes', () => {
    expect(() => validateExhibitorMapUpload(VALID)).not.toThrow();
    expect(() =>
      validateExhibitorMapUpload({ ...VALID, contentType: 'application/octet-stream' }),
    ).toThrow(/accepted file type/);
    expect(() => validateExhibitorMapUpload({ ...VALID, filename: 'floor.txt' })).toThrow(
      /\.pdf file/,
    );
    expect(() =>
      validateExhibitorMapUpload({ ...VALID, bytes: new TextEncoder().encode('not a pdf') }),
    ).toThrow(/not a readable PDF/);
    expect(() =>
      validateExhibitorMapUpload({ ...VALID, sizeBytes: 26 * 1024 * 1024 }),
    ).toThrow(/up to 25 MB/);
  });

  it('requires event management before it validates or stores anything', async () => {
    try {
      await uploadExhibitorMap(speaker, VALID);
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      if (isAppError(error)) expect(error.code).toBe('forbidden');
      return;
    }
    throw new Error('expected speaker upload to be refused');
  });
});

describe('public exhibitor map bytes', () => {
  const dialect = new PgDialect();
  const get = vi.fn();
  let joinCondition: unknown;
  let whereCondition: unknown;
  let rows: unknown[];

  beforeEach(() => {
    joinCondition = null;
    whereCondition = null;
    rows = [
      {
        slot: { eventId: 'event-1', fileId: 'file-1' },
        record: {
          id: 'file-1',
          eventId: 'event-1',
          storageKey: 'events/event-1/map',
          filename: 'floor.pdf',
          contentType: 'application/pdf',
          sizeBytes: 12,
        },
      },
    ];

    const builder = {
      from: () => builder,
      innerJoin: (_table: unknown, condition: unknown) => {
        joinCondition = condition;
        return builder;
      },
      where: (condition: unknown) => {
        whereCondition = condition;
        return builder;
      },
      limit: async () => rows,
    };
    state.db = {
      query: { event: { findFirst: async () => ({ id: 'event-1', slug: 'forum' }) } },
      select: () => builder,
    };
    state.storage = { get };
    get.mockReset();
    get.mockResolvedValue({
      body: new ReadableStream(),
      contentType: 'application/pdf',
      sizeBytes: 12,
    });
  });

  it('binds the current slot and file to the event named by the public slug', async () => {
    const result = await readPublicExhibitorMap('forum');
    const join = dialect.sqlToQuery(joinCondition as Parameters<PgDialect['sqlToQuery']>[0]);
    const where = dialect.sqlToQuery(whereCondition as Parameters<PgDialect['sqlToQuery']>[0]);

    expect(join.sql).toContain('"file"."id" = "event_exhibitor_map"."file_id"');
    expect(join.sql).toContain('"file"."event_id" = "event_exhibitor_map"."event_id"');
    expect(where.sql).toContain('"event_exhibitor_map"."event_id" = $1');
    expect(where.params).toEqual(['event-1']);
    expect(get).toHaveBeenCalledWith('events/event-1/map');
    expect(result.contentType).toBe('application/pdf');
  });

  it('fails closed when the event has no current map slot', async () => {
    rows = [];
    await expect(readPublicExhibitorMap('forum')).rejects.toMatchObject({ code: 'not_found' });
    expect(get).not.toHaveBeenCalled();
  });
});
