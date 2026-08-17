import type { MembershipRole } from '@/lib/context';

/**
 * Where an account that has just signed in actually belongs.
 *
 * The precedence is the organizer shell's, deliberately: `app/organizer/layout.tsx` already decides
 * that an organizer sees the workspace, a reviewer without an organizer row goes to `/review`, and
 * everyone else goes to `/portal`. A second ordering here would be a second answer to the same
 * question, and the two would drift the first time a role earned a surface.
 *
 * `null` is the case this route exists for: an account holding no membership anywhere. Every other
 * path in the product used to send that person to `/events/new`, which reads as the product
 * telling an invited speaker that running a conference is the only thing they may do.
 */
export function welcomeDestination(
  events: readonly { roles: readonly MembershipRole[] }[],
): string | null {
  const held = new Set(events.flatMap((candidate) => candidate.roles));
  if (held.has('organizer')) return '/organizer';
  if (held.has('reviewer')) return '/review';
  if (held.has('speaker')) return '/portal';
  return null;
}
