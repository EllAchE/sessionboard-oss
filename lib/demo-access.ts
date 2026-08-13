import { env, envFlag } from './env';
import { undeliverableRecipient } from './mail/config';

/**
 * `T-6` and `T-7a` in the same deployment.
 *
 * `T-6` wants real transactional mail leaving the deployed instance. `T-7a` wants a judge with no
 * mailbox on it to be able to sign in anyway, which the product does by printing the magic link on
 * the sign-in page. Printing a magic link is handing out a session for whatever address was typed
 * into the box, so under a real transport those two requirements are in direct conflict — and that
 * conflict, not any missing code, is what kept the deployment on the log transport.
 *
 * They reconcile if the demo identities are unreachable by mail *by construction* rather than by
 * switching delivery off for everybody. The seed builds both demo events entirely out of
 * IANA-reserved domains (`organizer@example.com`, six hundred senators at
 * `@first-settlement.example`), `sendMail` routes reserved domains to the dev mailbox whatever
 * transport is live, and this module decides — conservatively — which addresses that makes eligible
 * for an on-screen link.
 *
 * ## Threat model
 *
 * The attacker is any visitor to the public deployment. They can type any address into the sign-in
 * form, register accounts freely, and read anything the page returns. What must never happen is
 * that this path yields a session as a real person: an organizer of a real event, a reviewer, a
 * speaker who submitted a talk, or any account outside the seeded demo. It must also not yield a
 * session as an account that has since been given access to a real event.
 *
 * ## The boundary
 *
 * A link is rendered only when **all four** conditions hold. They are independent, so no single
 * mistake opens it:
 *
 *  1. `DEMO_ONSCREEN_MAGIC_LINKS` is explicitly on. Default off — off in a fresh clone, off for
 *     every self-hoster, on only where an operator set it on an instance seeded with demo data.
 *  2. The address is at a domain reserved by RFC 2606 / 6761, so no mailbox behind it can exist and
 *     no person can be denied one. Every real address fails here, which is the load-bearing check:
 *     a real organizer's account is not reachable through this path at any setting.
 *  3. The account already exists and holds membership on a seeded demo event. Registering
 *     `attacker@example.com` satisfies (2) and still yields nothing.
 *  4. It holds membership on no event outside the demo other than ones it owns itself. If a real
 *     organizer ever invites a demo identity into their event, this path closes for that identity
 *     instead of leaking the event — while a judge who signs in as the demo organizer and builds
 *     their own event beside the seed keeps working.
 *
 * Separately, and pre-existing: where the configured transport is `log` the instance delivers
 * nothing to anyone, so an inbox is not a credential on it for any account and the link is shown as
 * it always has been. That is the state of a fresh clone and of the deployment until an operator
 * puts a Resend key on it.
 *
 * Deliberately *not* a condition: a failed send. Revealing the link whenever a provider says no
 * would hand over any real account on any address a provider happens to reject, throttle or
 * greylist — an auth bypass triggerable by a stranger with a bounce.
 */

const DEFAULT_DEMO_EVENT_SLUGS = ['demo', 'first-settlement'] as const;

/** Which events count as the demo. `DEMO_EVENT_SLUGS` overrides it for a differently seeded clone. */
export function demoEventSlugs(): string[] {
  const configured = env('DEMO_EVENT_SLUGS');
  if (!configured) return [...DEFAULT_DEMO_EVENT_SLUGS];
  return configured
    .split(',')
    .map((slug) => slug.trim().toLowerCase())
    .filter(Boolean);
}

/** Condition 1, and the switch the whole feature hangs from. */
export function onScreenLinksEnabled(): boolean {
  return envFlag('DEMO_ONSCREEN_MAGIC_LINKS');
}

/**
 * The address the sign-in page offers as the way in for someone who is only here to look. `null`
 * unless the deployment opted in, so nothing is advertised that would not work.
 */
export function demoSignInEmail(): string | null {
  if (!onScreenLinksEnabled()) return null;
  return env('DEMO_SIGNIN_EMAIL') ?? 'organizer@example.com';
}

export type DemoMembership = { slug: string; ownerUserId: string | null };

/** Conditions 3 and 4, over rows rather than a database, so the rule itself is testable. */
export function membershipsAreDemoOnly(
  accountId: string,
  rows: readonly DemoMembership[],
  slugs: readonly string[],
): boolean {
  const demo = new Set(slugs);
  if (!rows.some((row) => demo.has(row.slug))) return false;
  return rows.every((row) => demo.has(row.slug) || row.ownerUserId === accountId);
}

export type LinkVisibility = 'instance-delivers-nothing' | 'seeded-demo-account' | null;

/**
 * Conditions 1 and 2, which need nothing but the environment and the address. `ask-the-database` is
 * the only answer that goes on to look an account up — a real address never reaches a query, let
 * alone a link.
 */
export function magicLinkPrecheck(
  transport: 'log' | 'smtp' | 'resend',
  email: string,
): 'instance-delivers-nothing' | 'ask-the-database' | null {
  if (transport === 'log') return 'instance-delivers-nothing';
  if (!onScreenLinksEnabled()) return null;
  if (!undeliverableRecipient(email)) return null;
  return 'ask-the-database';
}
