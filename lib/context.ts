import { forbidden, unauthorized } from './errors';

/**
 * Organizer routes carry no event in their path, so the current event travels in a cookie. Putting
 * it in the URL instead would mean every feature route learns an `[eventSlug]` segment, and the
 * switch is a rare action compared with the navigation it would tax.
 *
 * It lives here, in the leaf module, rather than beside the code that reads it in
 * `lib/services/events.ts` — which re-exports it, so every existing import still resolves. `lib/auth.ts`
 * is what forced the move: it has to write the cookie when a sign-in link names an event, and
 * `events.ts` imports `auth.ts`, so importing the name back the other way would close a cycle.
 */
export const EVENT_COOKIE = 'cicero_event';

export type MembershipRole = 'organizer' | 'reviewer' | 'speaker';

/**
 * Who is acting. Services take this explicitly rather than reading a cookie, which is what keeps
 * them callable from a REST handler, a Server Action, a cron job and a test with equal ease.
 */
export type Actor = {
  userId: string;
  email: string;
  name: string | null;
  /**
   * `S-10`: set when an organizer is acting as this user. The session *is* the speaker — every
   * write is real and takes effect. This identifies the organizer to the live request and the
   * "you are viewing as…" banner; services that promise durable attribution must persist it on the
   * resulting record. Never use this to pick an authorization path; an impersonated session must
   * otherwise behave identically or it is a preview again.
   */
  impersonatedByUserId: string | null;
};

/** An actor plus the event they are acting inside. Every service call is scoped to one event. */
export type EventContext = {
  actor: Actor;
  eventId: string;
  roles: MembershipRole[];
};

export type Capability =
  | 'event:manage'
  | 'form:manage'
  | 'submission:read_all'
  | 'submission:review'
  | 'submission:decide'
  | 'agenda:manage'
  | 'comms:send'
  | 'portal:manage'
  | 'task:manage'
  | 'integration:manage'
  | 'participant:impersonate'
  | 'portal:use';

const CAPABILITIES: Record<MembershipRole, readonly Capability[]> = {
  organizer: [
    'event:manage',
    'form:manage',
    'submission:read_all',
    'submission:review',
    'submission:decide',
    'agenda:manage',
    'comms:send',
    'portal:manage',
    'task:manage',
    'integration:manage',
    'participant:impersonate',
    'portal:use',
  ],
  /** A reviewer scores what they are assigned and never sees the decision controls. */
  reviewer: ['submission:read_all', 'submission:review'],
  speaker: ['portal:use'],
};

export function can(ctx: EventContext, capability: Capability): boolean {
  return ctx.roles.some((role) => CAPABILITIES[role].includes(capability));
}

export function requireCapability(ctx: EventContext, capability: Capability): void {
  if (!can(ctx, capability)) {
    throw forbidden(`This action needs the ${capability} permission`);
  }
}

export function requireRole(ctx: EventContext, role: MembershipRole): void {
  if (!ctx.roles.includes(role)) {
    throw forbidden(`This action is limited to ${role}s`);
  }
}

export function requireActor(actor: Actor | null | undefined): Actor {
  if (!actor) throw unauthorized();
  return actor;
}

export function isImpersonating(ctx: EventContext): boolean {
  return ctx.actor.impersonatedByUserId !== null;
}

/**
 * A speaker sees only their own rows; anyone with `submission:read_all` sees the event's. Services
 * that list submissions call this instead of re-deriving the rule, so the two never drift apart.
 */
export function visibleSubmitterId(ctx: EventContext): string | undefined {
  return can(ctx, 'submission:read_all') ? undefined : ctx.actor.userId;
}
