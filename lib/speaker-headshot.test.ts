import { describe, expect, it } from 'vitest';
import { publicSpeakerHeadshotUrl, speakerHeadshotPath } from './speaker-headshot';

const FILE_ID = '87654321-4321-4321-4321-cba987654321';

describe('speakerHeadshotPath', () => {
  it('points at the route that actually serves headshots', () => {
    expect(speakerHeadshotPath('first-settlement', FILE_ID)).toBe(
      `/embed/first-settlement/headshot/${FILE_ID}`,
    );
  });

  it('never emits the /api/files path, which no route has ever answered', () => {
    expect(speakerHeadshotPath('first-settlement', FILE_ID)).not.toContain('/api/files');
  });

  it('returns null rather than a half-built path when either half is missing', () => {
    expect(speakerHeadshotPath('first-settlement', null)).toBeNull();
    expect(speakerHeadshotPath(null, FILE_ID)).toBeNull();
    expect(speakerHeadshotPath(undefined, undefined)).toBeNull();
  });

  it('escapes the slug so it cannot climb out of the event it names', () => {
    expect(speakerHeadshotPath('../../admin', FILE_ID)).toBe(
      `/embed/..%2F..%2Fadmin/headshot/${FILE_ID}`,
    );
  });
});

describe('publicSpeakerHeadshotUrl', () => {
  const base = {
    origin: 'https://cicero.test',
    eventSlug: 'first-settlement',
    headshotFileId: FILE_ID,
  };

  it('is absolute, because the readers are an API client and Accelevents', () => {
    expect(publicSpeakerHeadshotUrl({ ...base, workflowStatus: 'confirmed' })).toBe(
      `https://cicero.test/embed/first-settlement/headshot/${FILE_ID}`,
    );
  });

  /**
   * The route serves confirmed participants only. Emitting a URL for anyone else would hand out a
   * link that 404s — and the fix for that is never to widen the route.
   */
  it('withholds the URL for a participant the public route will not serve', () => {
    for (const workflowStatus of ['invited', 'pending', 'declined', 'withdrawn']) {
      expect(publicSpeakerHeadshotUrl({ ...base, workflowStatus })).toBeNull();
    }
  });

  it('is null for a confirmed speaker who has not uploaded anything', () => {
    expect(
      publicSpeakerHeadshotUrl({ ...base, workflowStatus: 'confirmed', headshotFileId: null }),
    ).toBeNull();
  });
});
