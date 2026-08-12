import { notFound, redirect } from 'next/navigation';
import { currentActor, requireEventContext } from '@/lib/auth';
import type { EventContext } from '@/lib/context';
import { can } from '@/lib/context';
import { isAppError } from '@/lib/errors';
import {
  ensureParticipant,
  getEventBySlug,
  type Participant,
  type PortalEvent,
} from '@/lib/services/portal';
import { ensureAssignments } from '@/lib/services/tasks';

export type PortalSession = {
  event: PortalEvent;
  ctx: EventContext;
  me: Participant;
  /** `S-10`. Non-null only while an organizer is acting as this speaker. */
  impersonatedByUserId: string | null;
};

/**
 * The single door into every portal surface. Resolving the participant and materialising task
 * assignments here — rather than on the tasks page alone — is what lets a speaker who has never
 * opened the portal land on a home screen that already knows what they owe.
 */
export async function portalSession(eventSlug: string): Promise<PortalSession> {
  const actor = await currentActor();
  if (!actor) redirect(`/signin?next=${encodeURIComponent(`/portal/${eventSlug}`)}`);

  const event = await getEventBySlug(eventSlug);
  if (!event) notFound();

  let ctx: EventContext;
  try {
    ctx = await requireEventContext(event.id);
  } catch (error) {
    if (isAppError(error) && error.code === 'not_found') notFound();
    throw error;
  }
  if (!can(ctx, 'portal:use')) notFound();

  const me = await ensureParticipant(ctx);
  await ensureAssignments(event.id, me.id);

  return { event, ctx, me, impersonatedByUserId: ctx.actor.impersonatedByUserId };
}

export function speakerName(me: Participant, ctx: EventContext): string {
  return me.displayName ?? ctx.actor.name ?? ctx.actor.email;
}

export function headshotUrl(eventSlug: string, fileId: string | null): string | undefined {
  return fileId ? `/portal/${eventSlug}/file/${fileId}` : undefined;
}
