import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/db/client', () => ({ getDb: vi.fn() }));
vi.mock('@/lib/services/files', () => ({ getFileRecord: vi.fn() }));
vi.mock('@/lib/storage', () => ({ getStorage: vi.fn() }));

import { getDb } from '@/db/client';
import { notFound } from '@/lib/errors';
import { getFileRecord } from '@/lib/services/files';
import { getStorage } from '@/lib/storage';
import { GET } from './route';

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

/**
 * `/api/v1/events/{slug}/speakers` and the Accelevents push both emit `/api/files/{id}` for a
 * headshot, and until this route existed both emitted a dead link. It is unauthenticated because
 * neither consumer holds a session, so what these tests pin is the gate that replaces the session:
 * bytes are served only when the id is genuinely somebody's `headshotFileId`.
 */

const HEADSHOT_ID = '11111111-1111-4111-8111-111111111111';
const DECK_ID = '22222222-2222-4222-8222-222222222222';

const RECORD = {
  id: HEADSHOT_ID,
  eventId: 'event-1',
  storageKey: 'events/event-1/abc/ada.png',
  filename: 'ada.png',
  contentType: 'image/png',
  sizeBytes: 1234,
  uploadedByUserId: 'user-1',
  rootFileId: null,
  version: 1,
  createdAt: new Date(),
};

function bytes(body: string) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
}

/** Only rows whose `headshot_file_id` matches are visible to the route's one query. */
function participantsWithHeadshot(...fileIds: string[]) {
  const findFirst = vi.fn(async () =>
    fileIds.includes(HEADSHOT_ID) ? { id: 'participant-1', eventId: 'event-1' } : undefined,
  );
  mocked(getDb).mockReturnValue({ query: { participant: { findFirst } } });
  return findFirst;
}

function get(fileId: string) {
  return GET(new Request(`https://cicero.test/api/files/${fileId}`), {
    params: Promise.resolve({ fileId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  participantsWithHeadshot(HEADSHOT_ID);
  mocked(getFileRecord).mockResolvedValue(RECORD);
  mocked(getStorage).mockReturnValue({
    get: vi.fn().mockResolvedValue({
      body: bytes('png-bytes'),
      contentType: 'image/png',
      sizeBytes: RECORD.sizeBytes,
    }),
  });
});

describe('GET /api/files/{fileId}', () => {
  it('serves the bytes of a file that is a participant headshot', async () => {
    const response = await get(HEADSHOT_ID);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('png-bytes');
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('content-length')).toBe('1234');
  });

  it('reads through the storage layer, keyed by the row rather than by the URL', async () => {
    await get(HEADSHOT_ID);

    // The event id comes from the participant that owns the headshot, so `getFileRecord` still
    // refuses a headshot id paired with a `file` row belonging to another event.
    expect(mocked(getFileRecord)).toHaveBeenCalledWith('event-1', HEADSHOT_ID);
    expect(mocked(getStorage).mock.results[0].value.get).toHaveBeenCalledWith(RECORD.storageKey);
  });

  it('caches publicly, because no session decides who may read it', async () => {
    const response = await get(HEADSHOT_ID);
    expect(response.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=3600');
  });

  /** The whole point of the route: a real file id that is not a headshot must not serve bytes. */
  it('404s on a file that exists but is nobody’s headshot', async () => {
    participantsWithHeadshot();

    const response = await get(DECK_ID);

    expect(response.status).toBe(404);
    expect(getFileRecord).not.toHaveBeenCalled();
    expect(getStorage).not.toHaveBeenCalled();
  });

  it('404s on an id no file has at all', async () => {
    participantsWithHeadshot();
    const response = await get('33333333-3333-4333-8333-333333333333');
    expect(response.status).toBe(404);
  });

  /**
   * `headshot_file_id` is a `uuid` column. Without the guard this is a Postgres cast error and the
   * caller gets a 500 for what is only a bad URL.
   */
  it('404s on a path segment that is not a uuid, without touching the database', async () => {
    const response = await get('not-a-uuid');

    expect(response.status).toBe(404);
    expect(getDb).not.toHaveBeenCalled();
  });

  it('404s rather than 500s when the row survives but the object is gone', async () => {
    mocked(getStorage).mockReturnValue({
      get: vi.fn().mockRejectedValue(notFound('That file')),
    });

    const response = await get(HEADSHOT_ID);
    expect(response.status).toBe(404);
  });
});
