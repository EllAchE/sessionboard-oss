import type { LinkVisibility } from '../../../../lib/demo-access';

/**
 * How a reviewer invitation reached — or failed to reach — the person invited, and what the
 * organizer is told about it.
 *
 * `email` — the invitation left the instance and the link is only inside it.
 * `logged` — this instance delivers nothing to anybody, so the link comes back on the page.
 * `demo` — real mail is live, and this is a seeded demo identity with no inbox to send it to.
 * `undelivered` — the provider refused the message. Reviewer access is granted either way; the
 *   link is *not* shown, because a bounce is not proof the organizer is entitled to a session as
 *   the invitee. See `lib/demo-access.ts` for why that is the whole point.
 */
export type InviteDelivery = 'email' | 'logged' | 'demo' | 'undelivered';

/**
 * The one mapping from "may the link be shown" (decided by `lib/demo-access.ts`, via
 * `magicLinkMayBeShown`) plus the send outcome to what the organizer sees.
 *
 * Note the asymmetry that this whole module exists to enforce: `visibility` alone decides the
 * link, and `delivered` alone decides the words. Delivery never feeds the link, so no send failure
 * — greylisting, a throttle, a full mailbox, a bad MX — can turn an invite box into a session as
 * whoever was typed into it.
 */
export function inviteDelivery(visibility: LinkVisibility, delivered: boolean): InviteDelivery {
  if (visibility === 'instance-delivers-nothing') return 'logged';
  if (visibility === 'seeded-demo-account') return 'demo';
  return delivered ? 'email' : 'undelivered';
}

export function inviteDeliveryCopy(
  delivery: InviteDelivery,
  reviewer: { name: string; email: string },
): { message: string; note: string | null } {
  if (delivery === 'email') {
    return { message: `Invitation sent to ${reviewer.email}.`, note: null };
  }

  if (delivery === 'undelivered') {
    return {
      message: `${reviewer.name} can review this event, but the invitation email did not go out.`,
      note: `Mail to ${reviewer.email} was refused, so they have no link yet. Their reviewer access is already granted, so send the invitation again, or reach them another way and have them sign in at /signin with this address.`,
    };
  }

  return {
    message: `${reviewer.name} can review this event. Copy their access link below.`,
    note:
      delivery === 'demo'
        ? 'This is a seeded demo account, at a reserved domain with no inbox behind it.'
        : 'Email delivery is disabled on this instance, so the link is shown here instead.',
  };
}
