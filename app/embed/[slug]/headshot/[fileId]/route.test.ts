import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findFile, findParticipant, getObject, loadPublicBundle } = vi.hoisted(() => ({
  findFile: vi.fn(),
  findParticipant: vi.fn(),
  getObject: vi.fn(),
  loadPublicBundle: vi.fn(),
}));

vi.mock('@/db/client', () => ({
  getDb: () => ({
    query: {
      file: { findFirst: findFile },
      participant: { findFirst: findParticipant },
    },
  }),
}));
vi.mock('@/lib/storage', () => ({ getStorage: () => ({ get: getObject }) }));
vi.mock('../../../queries', () => ({ loadPublicBundle }));

import { speakerHeadshotPath } from '@/lib/speaker-headshot';
import { GET } from './route';

const EVENT_ID = 'event-first-settlement';
const HEADSHOT_ID = '87654321-4321-4321-4321-cba987654321';
const DECK_ID = '11111111-2222-3333-4444-555555555555';

/**
 * The speaker's URL is built by the same helper the REST surface and the Accelevents push use, so
 * these tests fail if the two ever describe different paths again.
 */
function bundle() {
  return {
    event: { id: EVENT_ID, slug: 'first-settlement' },
    speakers: [
      {
        id: 'speaker-1',
        headshotUrl: speakerHeadshotPath('first-settlement', HEADSHOT_ID),
      },
    ],
  };
}

function call(fileId: string, slug = 'first-settlement') {
  return GET(new Request(`https://cicero.test/embed/${slug}/headshot/${fileId}`), {
    params: Promise.resolve({ slug, fileId }),
  });
}

describe('public headshot route', () => {
  beforeEach(() => {
    for (const mock of [findFile, findParticipant, getObject, loadPublicBundle]) mock.mockReset();
    loadPublicBundle.mockResolvedValue(bundle());
    findFile.mockResolvedValue({
      id: HEADSHOT_ID,
      eventId: EVENT_ID,
      storageKey: 'events/first-settlement/abc/headshot.png',
      contentType: 'image/png',
    });
    findParticipant.mockResolvedValue({ id: 'speaker-1', headshotFileId: HEADSHOT_ID });
    getObject.mockResolvedValue({ body: 'bytes', contentType: 'image/png', sizeBytes: 12 });
  });

  it('serves the headshot named by a publicly visible speaker', async () => {
    const response = await call(HEADSHOT_ID);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
  });

  it('is the URL the read model hands out, so the link is never dead', async () => {
    const [speaker] = bundle().speakers;
    expect(speaker.headshotUrl).toBe(`/embed/first-settlement/headshot/${HEADSHOT_ID}`);
    expect((await call(HEADSHOT_ID)).status).toBe(200);
  });

  /**
   * The access check that matters. A file id on this event that is not a visible speaker's headshot
   * — an uploaded deck, a contract — must not be readable through here, and nothing is fetched from
   * storage before that is settled.
   */
  it('refuses a file id on the event that no visible speaker claims', async () => {
    const response = await call(DECK_ID);
    expect(response.status).toBe(404);
    expect(getObject).not.toHaveBeenCalled();
  });

  it('refuses a headshot whose participant is no longer on the event', async () => {
    findParticipant.mockResolvedValue(undefined);
    expect((await call(HEADSHOT_ID)).status).toBe(404);
    expect(getObject).not.toHaveBeenCalled();
  });

  it('refuses a file row belonging to a different event', async () => {
    findFile.mockResolvedValue(undefined);
    expect((await call(HEADSHOT_ID)).status).toBe(404);
    expect(getObject).not.toHaveBeenCalled();
  });

  it('refuses everything for an event that does not exist', async () => {
    loadPublicBundle.mockResolvedValue(null);
    expect((await call(HEADSHOT_ID, 'no-such-event')).status).toBe(404);
    expect(findFile).not.toHaveBeenCalled();
  });
});
