import { readPublishedRecording } from '@/lib/services/recordings';

type Params = { slug: string; recordingId: string };

/** A deliberate-public stream. Draft, cross-event, and unpublished-session ids all resolve 404. */
export async function GET(_request: Request, { params }: { params: Promise<Params> }) {
  try {
    const { slug, recordingId } = await params;
    const result = await readPublishedRecording(slug, recordingId);
    const encoded = encodeURIComponent(result.record.filename);
    return new Response(result.body, {
      headers: {
        'Content-Type': result.contentType,
        'Content-Length': String(result.record.sizeBytes),
        'Content-Disposition': `inline; filename*=UTF-8''${encoded}`,
        // This URL does not change when an organizer unpublishes; caching would outlive the gate.
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    // Public asset paths are intentionally opaque: missing, draft, and cross-event all look alike.
    return new Response('Not found', { status: 404 });
  }
}
