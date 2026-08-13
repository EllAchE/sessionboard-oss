import { NextResponse } from 'next/server';
import { runScheduledJobs } from '@/lib/services/comms';
import { env } from '@/lib/env';
import { hashToken, timingSafeEqual } from '@/lib/ids';

/**
 * `C-7`'s dispatcher. Cloudflare Cron Triggers hit this in production; a plain crontab or a
 * `systemd` timer hits it self-hosted. Both deliver at least once and neither guarantees it will
 * not fire twice, so every job behind `runScheduledJobs` carries its own guard rather than
 * assuming this handler runs exactly once.
 *
 * `CRON_SECRET` is optional on purpose: the jobs are idempotent and send nothing that is not
 * already due, so an unauthenticated call is a wasted query rather than a way to spam speakers. Set
 * it on any deployment reachable from the open internet.
 */
export const dynamic = 'force-dynamic';

/**
 * Both sides are hashed before they are compared. `timingSafeEqual` is constant-time across a pair
 * of equal-length strings but returns immediately when the lengths differ, so comparing the raw
 * secrets would still let a caller time out how long `CRON_SECRET` is one character at a time. Two
 * SHA-256 digests are always 64 characters, which puts every wrong guess — wrong length included —
 * on the same path for the same duration.
 */
async function secretMatches(provided: string, expected: string): Promise<boolean> {
  const [providedHash, expectedHash] = await Promise.all([
    hashToken(provided),
    hashToken(expected),
  ]);
  return timingSafeEqual(providedHash, expectedHash);
}

async function run(request: Request): Promise<Response> {
  const secret = env('CRON_SECRET');
  if (secret) {
    const header = request.headers.get('authorization') ?? '';
    const provided = header.replace(/^Bearer\s+/i, '');
    if (!(await secretMatches(provided, secret))) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await runScheduledJobs();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request): Promise<Response> {
  return run(request);
}

export async function POST(request: Request): Promise<Response> {
  return run(request);
}
