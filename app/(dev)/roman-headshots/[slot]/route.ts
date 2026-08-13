import { renderRomanSpeakerHeadshot } from '@/lib/roman-speaker-headshots';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slot: string }> },
) {
  if (process.env.NODE_ENV !== 'development') {
    return new Response('Not found', { status: 404 });
  }

  const slot = Number((await params).slot);
  if (!Number.isSafeInteger(slot) || slot < 0) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(renderRomanSpeakerHeadshot(`gallery-speaker-${slot + 1}`, slot), {
    headers: {
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Type': 'image/svg+xml; charset=utf-8',
    },
  });
}
