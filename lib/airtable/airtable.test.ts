import { describe, expect, it } from 'vitest';
import { AppError } from '../errors';
import { AirtableClient } from './client';
import { sessionFields, speakerFields, submissionFields } from './mapping';

type Reply = { status: number; body: unknown };

function stubFetch(replies: Reply[]): {
  fetchImpl: typeof fetch;
  at: number[];
  bodies: unknown[];
} {
  const at: number[] = [];
  const bodies: unknown[] = [];
  const queue = [...replies];

  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    at.push(Date.now());
    bodies.push(typeof init?.body === 'string' ? JSON.parse(init.body) : null);
    const reply = queue.shift() ?? { status: 200, body: { records: [] } };
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;

  return { fetchImpl, at, bodies };
}

function client(fetchImpl: typeof fetch) {
  return new AirtableClient({
    apiKey: 'pat_test',
    baseId: 'appTest',
    fetchImpl,
  });
}

describe('rate limiting', () => {
  it('spaces concurrent requests so the base never sees more than 5 per second', async () => {
    const { fetchImpl, at } = stubFetch([
      { status: 200, body: { records: [] } },
      { status: 200, body: { records: [] } },
      { status: 200, body: { records: [] } },
    ]);
    const airtable = client(fetchImpl);

    await Promise.all([
      airtable.listRecords('Speakers'),
      airtable.listRecords('Speakers'),
      airtable.listRecords('Speakers'),
    ]);

    expect(at).toHaveLength(3);
    expect(at[1] - at[0]).toBeGreaterThanOrEqual(190);
    expect(at[2] - at[1]).toBeGreaterThanOrEqual(190);
  });
});

describe('batching', () => {
  it('splits a create into Airtable-sized chunks of ten', async () => {
    const { fetchImpl, bodies } = stubFetch([
      {
        status: 200,
        body: {
          records: Array.from({ length: 10 }, (_, i) => ({
            id: `rec${i}`,
            fields: {},
          })),
        },
      },
      { status: 200, body: { records: [{ id: 'rec10', fields: {} }] } },
    ]);

    const created = await client(fetchImpl).createRecords(
      'Speakers',
      Array.from({ length: 11 }, (_, i) => ({ Name: `Person ${i}` })),
    );

    expect(bodies).toHaveLength(2);
    expect((bodies[0] as { records: unknown[] }).records).toHaveLength(10);
    expect((bodies[1] as { records: unknown[] }).records).toHaveLength(1);
    expect(created).toHaveLength(11);
  });
});

describe('error translation', () => {
  it('maps a 429 to rate_limited so the backfill stops rather than burning the batch', async () => {
    const { fetchImpl } = stubFetch([
      {
        status: 429,
        body: { error: { type: 'RATE_LIMIT_REACHED', message: 'slow down' } },
      },
    ]);

    await expect(client(fetchImpl).listRecords('Speakers')).rejects.toSatisfy(
      (error: unknown) => error instanceof AppError && error.code === 'rate_limited',
    );
  });

  it('maps a 401 to unauthorized', async () => {
    const { fetchImpl } = stubFetch([{ status: 401, body: { error: 'AUTHENTICATION_REQUIRED' } }]);
    await expect(client(fetchImpl).listRecords('Speakers')).rejects.toSatisfy(
      (error: unknown) => error instanceof AppError && error.code === 'unauthorized',
    );
  });

  it('maps an unknown field to invalid with Airtable’s own message', async () => {
    const { fetchImpl } = stubFetch([
      {
        status: 422,
        body: {
          error: {
            type: 'UNKNOWN_FIELD_NAME',
            message: 'Unknown field name: "Ref"',
          },
        },
      },
    ]);

    await expect(client(fetchImpl).createRecords('Agenda', [{ Ref: 'SESS-1' }])).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof AppError &&
        error.code === 'invalid' &&
        error.message.includes('Unknown field'),
    );
  });
});

describe('field mapping', () => {
  it('writes dates as ISO strings and nulls as empty cells', () => {
    const fields = submissionFields({
      id: 'sub-1',
      ref: 'ABS-4',
      title: 'Talk',
      status: 'accepted',
      trackName: 'AI',
      formatName: null,
      level: null,
      speakerName: 'Ada',
      speakerEmail: 'ada@example.com',
      abstract: 'About the talk',
      submittedAt: new Date('2026-03-01T10:00:00Z'),
    });

    expect(fields['Submitted At']).toBe('2026-03-01T10:00:00.000Z');
    expect(fields.Format).toBeNull();
    expect(fields['Cicero ID']).toBe('sub-1');
  });

  it('flattens the lists Airtable cannot join on', () => {
    expect(
      speakerFields({
        id: 'p1',
        name: 'Ada',
        email: 'ada@example.com',
        jobTitle: null,
        company: null,
        pronouns: null,
        bio: null,
        acceptedSessions: ['One', 'Two'],
      })['Accepted Sessions'],
    ).toBe('One, Two');

    expect(
      sessionFields({
        id: 's1',
        ref: 'SESS-1',
        title: 'Keynote',
        status: 'published',
        trackName: null,
        roomName: 'Main Hall',
        startsAt: null,
        endsAt: null,
        speakerNames: ['Ada', 'Grace'],
      }).Speakers,
    ).toBe('Ada, Grace');
  });
});
