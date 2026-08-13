import { bearerToken, requireApiKey } from '@/app/api/v1/_lib/auth';
import { httpStatus, toPublicError } from '@/lib/errors';
import { handleCiceroMcpRequest } from '@/lib/mcp/server';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ slug: string }> };

function errorResponse(error: unknown): Response {
  const publicError = toPublicError(error);
  const status = httpStatus(error);
  const headers: Record<string, string> = { 'cache-control': 'no-store' };
  if (status === 401) headers['www-authenticate'] = 'Bearer realm="Cicero MCP"';
  return Response.json(
    { error: publicError },
    {
      status,
      headers,
    },
  );
}

async function serve(request: Request, context: RouteContext): Promise<Response> {
  const requestOrigin = request.headers.get('origin');
  if (requestOrigin && requestOrigin !== new URL(request.url).origin) {
    return Response.json(
      { error: { code: 'forbidden', message: 'Cross-origin MCP requests are not allowed' } },
      { status: 403, headers: { 'cache-control': 'no-store' } },
    );
  }

  try {
    const { slug } = await context.params;
    const token = bearerToken(request);
    const key = await requireApiKey(request, slug);
    return await handleCiceroMcpRequest(request, {
      ...key,
      scopes: key.scope === 'write' ? ['read', 'write'] : ['read'],
      token: token ?? '',
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export const POST = serve;
export const GET = serve;
export const DELETE = serve;
