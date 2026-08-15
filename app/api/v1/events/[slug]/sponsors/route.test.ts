import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/api/v1/_lib/queries', () => ({
  listApiSponsors: vi.fn(),
  requireEvent: vi.fn(),
}));
vi.mock('@/lib/rate-limit', () => ({ enforcePublicApiRateLimit: vi.fn() }));

import { listApiSponsors, requireEvent } from '@/app/api/v1/_lib/queries';
import { rateLimited } from '@/lib/errors';
import { enforcePublicApiRateLimit } from '@/lib/rate-limit';
import { GET } from './route';

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mocked(requireEvent).mockResolvedValue({ id: 'event-1', slug: 'forum' });
  mocked(listApiSponsors).mockResolvedValue({ data: [], total: 0 });
});

describe('GET /api/v1/events/[slug]/sponsors', () => {
  it('passes bounded public filters to the published-only query', async () => {
    const response = await GET(
      new Request(
        'https://cicero.test/api/v1/events/forum/sponsors?kind=exhibitor&tier=Principal&limit=20',
      ),
      { params: Promise.resolve({ slug: 'forum' }) },
    );

    expect(response.status).toBe(200);
    expect(listApiSponsors).toHaveBeenCalledWith(
      { id: 'event-1', slug: 'forum' },
      { kind: 'exhibitor', tier: 'Principal', limit: 20 },
    );
  });

  it('does not cache rows past a later unpublish', async () => {
    const response = await GET(
      new Request('https://cicero.test/api/v1/events/forum/sponsors'),
      { params: Promise.resolve({ slug: 'forum' }) },
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('meters the caller, like every other unauthenticated read', async () => {
    const request = new Request('https://cicero.test/api/v1/events/forum/sponsors');
    const response = await GET(request, { params: Promise.resolve({ slug: 'forum' }) });

    expect(response.status).toBe(200);
    expect(enforcePublicApiRateLimit).toHaveBeenCalledWith(request);
  });

  it('turns the caller away without reading sponsors once the limit is spent', async () => {
    mocked(enforcePublicApiRateLimit).mockRejectedValueOnce(rateLimited());

    const response = await GET(
      new Request('https://cicero.test/api/v1/events/forum/sponsors'),
      { params: Promise.resolve({ slug: 'forum' }) },
    );

    expect(response.status).toBe(429);
    expect(listApiSponsors).not.toHaveBeenCalled();
  });

  it('rejects unknown or ambiguous filters before loading the event', async () => {
    for (const query of ['?status=draft', '?kind=sponsor&kind=exhibitor']) {
      const response = await GET(
        new Request(`https://cicero.test/api/v1/events/forum/sponsors${query}`),
        { params: Promise.resolve({ slug: 'forum' }) },
      );
      expect(response.status).toBe(422);
    }
    expect(requireEvent).not.toHaveBeenCalled();
  });
});
