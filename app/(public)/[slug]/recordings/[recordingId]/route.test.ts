import { beforeEach, describe, expect, it, vi } from 'vitest';

const { readPublishedRecording } = vi.hoisted(() => ({ readPublishedRecording: vi.fn() }));
vi.mock('@/lib/services/recordings', () => ({ readPublishedRecording }));

import { GET } from './route';

describe('public recording route', () => {
  beforeEach(() => readPublishedRecording.mockReset());

  it('streams only the service-authorized published object', async () => {
    readPublishedRecording.mockResolvedValue({
      record: { filename: 'session.mp4', sizeBytes: 4 },
      contentType: 'video/mp4',
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3, 4]));
          controller.close();
        },
      }),
    });
    const response = await GET(new Request('https://cicero.test/assembly/recordings/rec-1'), {
      params: Promise.resolve({ slug: 'assembly', recordingId: 'rec-1' }),
    });
    expect(readPublishedRecording).toHaveBeenCalledWith('assembly', 'rec-1');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('video/mp4');
    expect(response.headers.get('content-disposition')).toContain('session.mp4');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('does not reveal whether a draft or cross-event id exists', async () => {
    readPublishedRecording.mockResolvedValue(null);
    const response = await GET(new Request('https://cicero.test/assembly/recordings/private'), {
      params: Promise.resolve({ slug: 'assembly', recordingId: 'private' }),
    });
    expect(response.status).toBe(404);
  });
});
