import { buildMcpToolManifest } from '@/lib/mcp/tools';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(buildMcpToolManifest(), {
    headers: { 'cache-control': 'public, max-age=300, stale-while-revalidate=3600' },
  });
}
