import { readPublicExhibitorMap } from '@/lib/services/exhibitor-map';

export const dynamic = 'force-dynamic';

/** Current-map-only public bytes. Removing or replacing the slot changes this route immediately. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const result = await readPublicExhibitorMap(slug);
    const encoded = encodeURIComponent(result.record.filename);
    const disposition = new URL(request.url).searchParams.has('download') ? 'attachment' : 'inline';
    return new Response(result.body, {
      headers: {
        'Content-Type': result.contentType,
        'Content-Length': String(result.record.sizeBytes),
        'Content-Disposition': `${disposition}; filename*=UTF-8''${encoded}`,
        'Cache-Control': 'private, no-store',
        'Content-Security-Policy': 'frame-ancestors *',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
