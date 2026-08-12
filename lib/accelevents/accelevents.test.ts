import { describe, expect, it } from 'vitest';
import { AppError } from '../errors';
import { AccelEventsClient } from './client';
import { FakeAccelEventsGateway } from './fake';
import {
  CREATE_SPEAKER_REQUEST,
  CREATE_SPEAKER_RESPONSE,
  DUPLICATE_SPEAKER_RESPONSE,
  EVENT_NOT_FOUND_RESPONSE,
  FIXTURE_EVENT_URL,
  LIST_SPEAKERS_RESPONSE,
  NOT_EVENT_HOST_RESPONSE,
  UNAUTHORIZED_RESPONSE,
} from './fixtures';
import { dedupeByEmail, flattenMarkdown, splitName, toSpeakerDto } from './mapping';
import type { AuthHeaderUsed } from './types';

/**
 * `N-1b`. Every assertion below runs against the recorded shapes in `./fixtures`, so the client is
 * exercised end to end without a key — which is the point, since a key may never arrive.
 */

type Call = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
};

/** Records what the client sent and replies from a queue of recorded responses. */
function recordingFetch(replies: { status: number; body: unknown }[]): {
  fetchImpl: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const queue = [...replies];

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = Object.fromEntries(
      Object.entries((init?.headers ?? {}) as Record<string, string>),
    );
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
    });

    const reply = queue.shift();
    if (!reply) throw new Error('the client made more requests than the fixture provides');
    return new Response(reply.body === null ? '' : JSON.stringify(reply.body), {
      status: reply.status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;

  return { fetchImpl, calls };
}

function client(fetchImpl: typeof fetch, authHeader: AuthHeaderUsed = 'Authorization') {
  return new AccelEventsClient({
    apiKey: 'test-key',
    eventUrl: FIXTURE_EVENT_URL,
    baseUrl: 'https://api.accelevents.com',
    authHeader,
    fetchImpl,
  });
}

describe('speaker push', () => {
  it('posts a SpeakerDTO to the documented path and returns the new speaker id', async () => {
    const { fetchImpl, calls } = recordingFetch([{ status: 200, body: CREATE_SPEAKER_RESPONSE }]);

    const result = await client(fetchImpl).createSpeaker({
      ...CREATE_SPEAKER_REQUEST,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe(
      `https://api.accelevents.com/rest/host/event/${FIXTURE_EVENT_URL}/speaker`,
    );
    expect(calls[0].body).toMatchObject({
      email: 'ada@example.com',
      firstName: 'Ada',
    });
    expect(result.outcome).toBe('created');
    expect(result.remoteId).toBe('12');
  });

  it('reads a bare integer body, which is what the create endpoint documents as its 200', async () => {
    const { fetchImpl } = recordingFetch([{ status: 200, body: 12 }]);
    const result = await client(fetchImpl).createSpeaker({
      ...CREATE_SPEAKER_REQUEST,
    });
    expect(result.remoteId).toBe('12');
  });

  it('reports 4068906 as a duplicate rather than throwing, so a batch survives it', async () => {
    const { fetchImpl } = recordingFetch([{ status: 400, body: DUPLICATE_SPEAKER_RESPONSE }]);

    const result = await client(fetchImpl).createSpeaker({
      ...CREATE_SPEAKER_REQUEST,
    });

    expect(result.outcome).toBe('duplicate');
    expect(result.remoteId).toBeNull();
  });

  it('surfaces a not-event-host reject as unauthorized', async () => {
    const { fetchImpl } = recordingFetch([{ status: 403, body: NOT_EVENT_HOST_RESPONSE }]);

    await expect(client(fetchImpl).createSpeaker({ ...CREATE_SPEAKER_REQUEST })).rejects.toSatisfy(
      (error: unknown) => error instanceof AppError && error.code === 'unauthorized',
    );
  });

  it('surfaces an unknown event as not_found', async () => {
    const { fetchImpl } = recordingFetch([{ status: 404, body: EVENT_NOT_FOUND_RESPONSE }]);

    await expect(client(fetchImpl).createSpeaker({ ...CREATE_SPEAKER_REQUEST })).rejects.toSatisfy(
      (error: unknown) => error instanceof AppError && error.code === 'not_found',
    );
  });
});

describe('the auth header ambiguity', () => {
  it('sends the configured header first', async () => {
    const { fetchImpl, calls } = recordingFetch([{ status: 200, body: CREATE_SPEAKER_RESPONSE }]);

    await client(fetchImpl).createSpeaker({ ...CREATE_SPEAKER_REQUEST });

    expect(calls[0].headers.Authorization).toBe('test-key');
    expect(calls[0].headers.Key).toBeUndefined();
  });

  it('retries once on Key after a 401 and reports which header worked', async () => {
    const { fetchImpl, calls } = recordingFetch([
      { status: 401, body: UNAUTHORIZED_RESPONSE },
      { status: 200, body: CREATE_SPEAKER_RESPONSE },
    ]);

    const result = await client(fetchImpl).createSpeaker({
      ...CREATE_SPEAKER_REQUEST,
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].headers.Authorization).toBe('test-key');
    expect(calls[1].headers.Key).toBe('test-key');
    expect(calls[1].headers.Authorization).toBeUndefined();
    expect(result.authHeaderUsed).toBe('Key');
    expect(result.outcome).toBe('created');
  });

  it('retries on Authorization when Key is the configured header', async () => {
    const { fetchImpl, calls } = recordingFetch([
      { status: 401, body: UNAUTHORIZED_RESPONSE },
      { status: 200, body: CREATE_SPEAKER_RESPONSE },
    ]);

    const result = await client(fetchImpl, 'Key').createSpeaker({
      ...CREATE_SPEAKER_REQUEST,
    });

    expect(calls[0].headers.Key).toBe('test-key');
    expect(calls[1].headers.Authorization).toBe('test-key');
    expect(result.authHeaderUsed).toBe('Authorization');
  });

  it('retries exactly once — two 401s are unauthorized, not a loop', async () => {
    const { fetchImpl, calls } = recordingFetch([
      { status: 401, body: UNAUTHORIZED_RESPONSE },
      { status: 401, body: UNAUTHORIZED_RESPONSE },
    ]);

    await expect(client(fetchImpl).createSpeaker({ ...CREATE_SPEAKER_REQUEST })).rejects.toSatisfy(
      (error: unknown) => error instanceof AppError && error.code === 'unauthorized',
    );
    expect(calls).toHaveLength(2);
  });
});

describe('speaker list', () => {
  it('sends the required expand param and parses the recorded response', async () => {
    const { fetchImpl, calls } = recordingFetch([{ status: 200, body: LIST_SPEAKERS_RESPONSE }]);

    const result = await client(fetchImpl).listSpeakers();

    expect(calls[0].url).toContain('expand=');
    expect(result.total).toBe(2);
    expect(result.speakers.map((s) => s.email)).toEqual(['ada@example.com', 'grace@example.com']);
  });
});

describe('the fake gateway', () => {
  it('accepts a speaker, then rejects the same email the way 4068906 does', async () => {
    const fake = new FakeAccelEventsGateway();

    const first = await fake.createSpeaker({ ...CREATE_SPEAKER_REQUEST });
    const second = await fake.createSpeaker({ ...CREATE_SPEAKER_REQUEST });

    expect(first.outcome).toBe('created');
    expect(second.outcome).toBe('duplicate');
    expect(second.response).toMatchObject({ errorCode: 4068906 });
  });

  it('treats a differently-cased address as the same email', async () => {
    const fake = new FakeAccelEventsGateway();
    await fake.createSpeaker({ ...CREATE_SPEAKER_REQUEST });
    const again = await fake.createSpeaker({
      ...CREATE_SPEAKER_REQUEST,
      email: 'ADA@example.com',
    });
    expect(again.outcome).toBe('duplicate');
  });

  it('reports a seeded speaker as already present without a first push', async () => {
    const fake = new FakeAccelEventsGateway({
      existingEmails: ['grace@example.com'],
    });
    const pushed = await fake.createSpeaker({
      firstName: 'Grace',
      lastName: 'Hopper',
      email: 'grace@example.com',
    });
    expect(pushed.outcome).toBe('duplicate');
  });

  it('fails every call when the key is rejected on both headers', async () => {
    const fake = new FakeAccelEventsGateway({ unauthorized: true });
    await expect(fake.createSpeaker({ ...CREATE_SPEAKER_REQUEST })).rejects.toSatisfy(
      (error: unknown) => error instanceof AppError && error.code === 'unauthorized',
    );
  });

  it('runs the experimental order flow through every documented step', async () => {
    const fake = new FakeAccelEventsGateway();
    const order = await fake.createAttendeeOrder({
      ticketTypeId: 4455,
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
    });

    expect(order.steps.map((s) => s.step)).toEqual([
      'availability',
      'calculateFee',
      'order',
      'formattributes',
      'payment',
    ]);
    expect(order.attendeeId).not.toBeNull();
  });

  it('rejects a ticket type the event does not sell', async () => {
    const fake = new FakeAccelEventsGateway();
    await expect(
      fake.createAttendeeOrder({
        ticketTypeId: 999,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe('field mapping', () => {
  it('splits a display name into first and last', () => {
    expect(splitName('Ada Lovelace')).toEqual({
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    expect(splitName('Ada King Lovelace')).toEqual({
      firstName: 'Ada King',
      lastName: 'Lovelace',
    });
    expect(splitName('Prince')).toEqual({ firstName: 'Prince', lastName: '' });
    expect(splitName(null)).toEqual({ firstName: '', lastName: '' });
  });

  it('flattens markdown so a bio does not arrive as syntax', () => {
    expect(flattenMarkdown('## Ada\n\n**Bold** and [a link](https://x.test).')).toBe(
      'Ada\n\nBold and a link.',
    );
  });

  it('maps a participant onto a SpeakerDTO, picking social links out by host', () => {
    const dto = toSpeakerDto({
      participantId: 'p1',
      email: '  Ada@Example.com ',
      name: 'Ada Lovelace',
      jobTitle: 'Engineer',
      company: 'Difference Engine Co',
      bioMarkdown: '**Ada** builds engines.',
      pronouns: 'she/her',
      headshotUrl: 'https://cdn.test/ada.jpg',
      links: [
        { label: 'LinkedIn', url: 'https://linkedin.com/in/ada' },
        { label: 'Site', url: 'https://ada.test' },
      ],
      position: 3,
    });

    expect(dto).toMatchObject({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      title: 'Engineer',
      bio: 'Ada builds engines.',
      linkedIn: 'https://linkedin.com/in/ada',
      position: 3,
      allowAttendeeAccess: true,
    });
    expect(dto.twitter).toBeUndefined();
  });

  it('dedupes a batch by email, since 4068906 rejects the second push', () => {
    const { unique, duplicates } = dedupeByEmail([
      { email: 'ada@example.com' },
      { email: 'grace@example.com' },
      { email: 'ADA@example.com ' },
      { email: '' },
    ]);

    expect(unique.map((r) => r.email)).toEqual(['ada@example.com', 'grace@example.com']);
    expect(duplicates).toHaveLength(1);
  });
});
