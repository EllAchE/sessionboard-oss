import { z } from 'zod';
import { simulatedFeed } from '@/lib/services/comms-simulator';
import { handle, parseQuery } from '../../v1/_lib/respond';

/**
 * The poll behind `components/comms/CommsSimulator`. `lib/services/comms-simulator.ts` owns every
 * decision about who may see what; this handler only translates.
 *
 * Signed out is a 200 with `active: false` rather than a 401. The client polls this on every page
 * including public ones, and a stream of 401s in the console reads like a bug in the app rather
 * than the ordinary state of a visitor who has not signed in.
 */
export const dynamic = 'force-dynamic';

/** `<iso timestamp>|<uuid>`. Anything malformed is treated as absent by `decodeCursor`. */
const query = z.object({
  email: z.string().max(80).optional(),
  sms: z.string().max(80).optional(),
});

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const params = parseQuery(query, new URL(request.url));
    const feed = await simulatedFeed({
      email: params.email ?? null,
      sms: params.sms ?? null,
    });
    return new Response(JSON.stringify({ data: feed }), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        // Per-viewer, and it carries message bodies. Nothing between here and the tab may keep it,
        // and no other origin has any business reading it — so no CORS header, unlike `/api/v1`.
        'cache-control': 'no-store, private',
      },
    });
  });
}
