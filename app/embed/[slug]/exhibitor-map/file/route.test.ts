import { beforeEach, describe, expect, it, vi } from 'vitest';

const { readPublicExhibitorMap } = vi.hoisted(() => ({ readPublicExhibitorMap: vi.fn() }));
vi.mock('@/lib/services/exhibitor-map', () => ({ readPublicExhibitorMap }));

import { GET } from './route';

function request(query = '') {
  return GET(new Request(`https://cicero.test/embed/forum/exhibitor-map/file${query}`), {
    params: Promise.resolve({ slug: 'forum' }),
  });
}

describe('public exhibitor map file route', () => {
  beforeEach(() => {
    readPublicExhibitorMap.mockReset();
    readPublicExhibitorMap.mockResolvedValue({
      record: { filename: 'forum floor.pdf', sizeBytes: 4 },
      contentType: 'application/pdf',
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3, 4]));
          controller.close();
        },
      }),
    });
  });

  it('serves only the service-authorized current map as inline, frameable PDF bytes', async () => {
    const response = await request();

    expect(readPublicExhibitorMap).toHaveBeenCalledWith('forum');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toContain('inline;');
    expect(response.headers.get('content-disposition')).toContain('forum%20floor.pdf');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-security-policy')).toBe('frame-ancestors *');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('offers an attachment fallback without changing the stable map URL', async () => {
    const response = await request('?download=1');
    expect(response.headers.get('content-disposition')).toContain('attachment;');
  });

  it('does not reveal whether the event, slot, record, or bytes were missing', async () => {
    readPublicExhibitorMap.mockRejectedValue(new Error('missing'));
    const response = await request();
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Not found');
  });
});
