import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/api/v1/_lib/auth', () => ({ bearerToken: vi.fn(), requireApiKey: vi.fn() }));
vi.mock('@/lib/mcp/server', () => ({ handleCiceroMcpRequest: vi.fn() }));

import { bearerToken, requireApiKey } from '@/app/api/v1/_lib/auth';
import { handleCiceroMcpRequest } from '@/lib/mcp/server';
import { POST } from './route';

const mockedBearerToken = bearerToken as unknown as ReturnType<typeof vi.fn>;
const mockedRequireApiKey = requireApiKey as unknown as ReturnType<typeof vi.fn>;
const mockedHandle = handleCiceroMcpRequest as unknown as ReturnType<typeof vi.fn>;

describe('event MCP route', () => {
  beforeEach(() => {
    mockedBearerToken.mockReset().mockReturnValue('secret-key');
    mockedRequireApiKey.mockReset().mockResolvedValue({
      keyId: 'key-1',
      eventId: 'event-1',
      eventSlug: 'first-settlement',
      name: 'Agent',
      scope: 'read',
    });
    mockedHandle.mockReset().mockResolvedValue(Response.json({ ok: true }));
  });

  it('passes the existing event key context into the web-standard MCP handler', async () => {
    const request = new Request('https://cicero.test/api/v1/events/first-settlement/mcp', {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    const response = await POST(request, {
      params: Promise.resolve({ slug: 'first-settlement' }),
    });

    expect(response.status).toBe(200);
    expect(mockedRequireApiKey).toHaveBeenCalledWith(request, 'first-settlement');
    expect(mockedHandle).toHaveBeenCalledWith(
      request,
      expect.objectContaining({
        eventId: 'event-1',
        scopes: ['read'],
        token: 'secret-key',
      }),
    );
  });

  it('rejects browser requests from another origin before authenticating', async () => {
    const request = new Request('https://cicero.test/api/v1/events/first-settlement/mcp', {
      method: 'POST',
      headers: { origin: 'https://attacker.test' },
    });
    const response = await POST(request, {
      params: Promise.resolve({ slug: 'first-settlement' }),
    });

    expect(response.status).toBe(403);
    expect(mockedRequireApiKey).not.toHaveBeenCalled();
  });
});
