'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { scheduledSession, sessionFormat, submission } from '@/db/schema';
import { requireCapability } from '@/lib/context';
import { toPublicError } from '@/lib/errors';
import { loadRecipientGraph, sendSessionInvites, type RecipientGraph } from '@/lib/services/comms';
import {
  allocateSessionRef,
  mintIcsUid,
  notifyIfPublished,
} from '@/lib/services/agenda-mutations';
import { currentEventContext } from '@/lib/services/events';
import { DEFAULT_SESSION_MINUTES } from '@/lib/services/schedule';

/**
 * Every agenda mutation. Each returns a result object rather than throwing: a drag that lands on a
 * stale row should surface a line of text under the board, not replace the organizer's half-built
 * schedule with an error boundary.
 *
 * Calendar invites are `lib/services/comms.ts`'s business — `sendSessionInvites` decides and
 * persists `ics_sequence` by itself, so nothing here writes that column or regenerates `ics_uid`.
 * `A-6` is the reason a draft move stays silent: the draft state exists precisely so an organizer
 * can rearrange without every speaker's calendar twitching. Only a *published* session notifies.
 */

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

function fail(error: unknown): { ok: false; error: string } {
  const message = toPublicError(error).message;
  console.error(message);
  return { ok: false, error: message };
}

function revalidate() {
  revalidatePath('/admin/agenda');
}

async function authorize() {
  const ctx = await currentEventContext();
  requireCapability(ctx, 'agenda:manage');
  return ctx;
}

export type PlacementInput = {
  /** A `scheduled_session.id`, or an accepted `submission.id` when the card came from the rail. */
  targetId: string;
  kind: 'session' | 'submission';
  roomId: string | null;
  startsAt: string;
  endsAt: string;
};

/**
 * The drop. A rail card becomes a real row here; a block already on the grid is moved in place. The
 * same action serves both because the organizer performed one gesture and should get one outcome.
 */
export async function placeSessionAction(
  input: PlacementInput,
): Promise<ActionResult<{ sessionId: string }>> {
  try {
    const ctx = await authorize();
    const db = getDb();
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);

    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      return { ok: false, error: 'That slot is not a valid time' };
    }
    if (endsAt.getTime() <= startsAt.getTime()) {
      return { ok: false, error: 'A session has to end after it starts' };
    }

    if (input.kind === 'session') {
      const existing = await db.query.scheduledSession.findFirst({
        where: and(
          eq(scheduledSession.id, input.targetId),
          eq(scheduledSession.eventId, ctx.eventId),
        ),
      });
      if (!existing) return { ok: false, error: 'That session is no longer on this agenda' };

      await db
        .update(scheduledSession)
        .set({ roomId: input.roomId, startsAt, endsAt, updatedAt: new Date() })
        .where(eq(scheduledSession.id, existing.id));

      await notifyIfPublished(existing.id);
      revalidate();
      return { ok: true, data: { sessionId: existing.id } };
    }

    const source = await db.query.submission.findFirst({
      where: and(eq(submission.id, input.targetId), eq(submission.eventId, ctx.eventId)),
    });
    if (!source) return { ok: false, error: 'That submission is no longer available' };

    const already = await db.query.scheduledSession.findFirst({
      where: and(
        eq(scheduledSession.eventId, ctx.eventId),
        eq(scheduledSession.submissionId, source.id),
      ),
    });
    if (already) {
      await db
        .update(scheduledSession)
        .set({ roomId: input.roomId, startsAt, endsAt, updatedAt: new Date() })
        .where(eq(scheduledSession.id, already.id));
      await notifyIfPublished(already.id);
      revalidate();
      return { ok: true, data: { sessionId: already.id } };
    }

    const [created] = await db
      .insert(scheduledSession)
      .values({
        eventId: ctx.eventId,
        submissionId: source.id,
        ref: await allocateSessionRef(ctx.eventId),
        title: source.title,
        descriptionMarkdown: source.descriptionMarkdown,
        roomId: input.roomId,
        trackId: source.trackId,
        formatId: source.formatId,
        startsAt,
        endsAt,
        status: 'draft',
        icsUid: mintIcsUid(),
      })
      .returning();

    revalidate();
    return { ok: true, data: { sessionId: created.id } };
  } catch (error) {
    return fail(error);
  }
}

/** `A-3` list view and the rail: clearing the slot returns a session to the unscheduled queue. */
export async function unscheduleSessionAction(sessionId: string): Promise<ActionResult> {
  try {
    const ctx = await authorize();
    const db = getDb();
    const existing = await db.query.scheduledSession.findFirst({
      where: and(eq(scheduledSession.id, sessionId), eq(scheduledSession.eventId, ctx.eventId)),
    });
    if (!existing) return { ok: false, error: 'That session is no longer on this agenda' };

    // Pulling a published talk off the grid is a cancellation as far as an attendee's calendar is
    // concerned, and has to be sent before the times are cleared — a row with no start cannot
    // produce a VEVENT to cancel.
    if (existing.status === 'published' && existing.startsAt) {
      await sendSessionInvites(sessionId, { cancel: true });
    }

    await db
      .update(scheduledSession)
      .set({ roomId: null, startsAt: null, endsAt: null, status: 'draft', updatedAt: new Date() })
      .where(eq(scheduledSession.id, sessionId));

    revalidate();
    return { ok: true, data: null };
  } catch (error) {
    return fail(error);
  }
}

export type ManualSessionInput = {
  /** Present when editing. */
  sessionId?: string | null;
  title: string;
  descriptionMarkdown?: string | null;
  roomId: string | null;
  trackId: string | null;
  formatId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  /** `A-9` */
  ceuCredits: string | null;
  clientId: string | null;
};

/**
 * `A-4` plus the manual half of the brief: a keynote, a break or lunch has no submission behind it
 * and still has to occupy the grid, or the agenda an attendee reads has a hole where lunch was.
 */
export async function saveManualSessionAction(
  input: ManualSessionInput,
): Promise<ActionResult<{ sessionId: string }>> {
  try {
    const ctx = await authorize();
    const db = getDb();

    const title = input.title.trim();
    if (!title) return { ok: false, error: 'A session needs a title' };

    const startsAt = input.startsAt ? new Date(input.startsAt) : null;
    let endsAt = input.endsAt ? new Date(input.endsAt) : null;

    if (startsAt && !endsAt) {
      const minutes = input.formatId
        ? ((
            await db.query.sessionFormat.findFirst({ where: eq(sessionFormat.id, input.formatId) })
          )?.durationMinutes ?? DEFAULT_SESSION_MINUTES)
        : DEFAULT_SESSION_MINUTES;
      endsAt = new Date(startsAt.getTime() + minutes * 60_000);
    }
    if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
      return { ok: false, error: 'A session has to end after it starts' };
    }

    const patch = {
      title,
      descriptionMarkdown: input.descriptionMarkdown?.trim() || null,
      roomId: input.roomId,
      trackId: input.trackId,
      formatId: input.formatId,
      startsAt,
      endsAt,
      ceuCredits: input.ceuCredits?.trim() || null,
      clientId: input.clientId?.trim() || null,
      updatedAt: new Date(),
    };

    if (input.sessionId) {
      const existing = await db.query.scheduledSession.findFirst({
        where: and(
          eq(scheduledSession.id, input.sessionId),
          eq(scheduledSession.eventId, ctx.eventId),
        ),
      });
      if (!existing) return { ok: false, error: 'That session is no longer on this agenda' };

      await db
        .update(scheduledSession)
        .set(patch)
        .where(eq(scheduledSession.id, existing.id));

      await notifyIfPublished(existing.id);
      revalidate();
      return { ok: true, data: { sessionId: existing.id } };
    }

    const [created] = await db
      .insert(scheduledSession)
      .values({
        eventId: ctx.eventId,
        submissionId: null,
        ref: await allocateSessionRef(ctx.eventId),
        status: 'draft',
        icsUid: mintIcsUid(),
        ...patch,
      })
      .returning();

    revalidate();
    return { ok: true, data: { sessionId: created.id } };
  } catch (error) {
    return fail(error);
  }
}

/** `A-6`. Publishing is what lets a session out to the public embeds and the speaker's calendar. */
export async function setSessionStatusAction(
  sessionId: string,
  status: 'draft' | 'published' | 'cancelled',
  graph?: RecipientGraph,
): Promise<ActionResult> {
  try {
    const ctx = await authorize();
    const db = getDb();
    const existing = await db.query.scheduledSession.findFirst({
      where: and(eq(scheduledSession.id, sessionId), eq(scheduledSession.eventId, ctx.eventId)),
    });
    if (!existing) return { ok: false, error: 'That session is no longer on this agenda' };
    if (existing.status === status) return { ok: true, data: null };

    if (status === 'published' && (!existing.startsAt || !existing.endsAt || !existing.roomId)) {
      return { ok: false, error: 'Give it a room and a time before publishing it' };
    }

    const wasVisible = existing.status === 'published';

    await db
      .update(scheduledSession)
      .set({ status, updatedAt: new Date() })
      .where(eq(scheduledSession.id, sessionId));

    if (status === 'published') await notifyIfPublished(sessionId, {}, graph);
    else if (wasVisible) await notifyIfPublished(sessionId, { cancel: true }, graph);

    revalidate();
    return { ok: true, data: null };
  } catch (error) {
    return fail(error);
  }
}

/** Batched so one publish click can't hand the worker an unbounded, isolate-killing loop. */
const PUBLISH_BATCH_SIZE = 25;

/** `A-6` in bulk: the organizer finishes rearranging and releases the whole day at once. */
export async function publishAllAction(
  sessionIds: string[],
): Promise<ActionResult<{ published: number; skipped: number }>> {
  try {
    const ctx = await authorize();
    // Loaded once and reused for every session below — resolving recipients per-session here
    // instead of per-participant is what keeps a whole-day publish from re-scanning the event
    // graph hundreds of times in one request.
    const graph = await loadRecipientGraph(ctx.eventId);
    let published = 0;
    let skipped = 0;
    for (let i = 0; i < sessionIds.length; i += PUBLISH_BATCH_SIZE) {
      const batch = sessionIds.slice(i, i + PUBLISH_BATCH_SIZE);
      for (const sessionId of batch) {
        const result = await setSessionStatusAction(sessionId, 'published', graph);
        if (result.ok) published += 1;
        else skipped += 1;
      }
    }
    revalidate();
    return { ok: true, data: { published, skipped } };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteSessionAction(sessionId: string): Promise<ActionResult> {
  try {
    const ctx = await authorize();
    const db = getDb();
    const existing = await db.query.scheduledSession.findFirst({
      where: and(eq(scheduledSession.id, sessionId), eq(scheduledSession.eventId, ctx.eventId)),
    });
    if (!existing) return { ok: true, data: null };

    if (existing.status === 'published' && existing.startsAt) {
      await sendSessionInvites(sessionId, { cancel: true });
    }
    await db.delete(scheduledSession).where(eq(scheduledSession.id, sessionId));

    revalidate();
    return { ok: true, data: null };
  } catch (error) {
    return fail(error);
  }
}

/** `A-8`. The organizer accepted an AI proposal; each placement lands through the same path as a drag. */
export async function applyProposalAction(
  placements: PlacementInput[],
): Promise<ActionResult<{ applied: number; failed: number }>> {
  try {
    await authorize();
    let applied = 0;
    let failed = 0;
    for (const placement of placements) {
      const result = await placeSessionAction(placement);
      if (result.ok) applied += 1;
      else failed += 1;
    }
    revalidate();
    return { ok: true, data: { applied, failed } };
  } catch (error) {
    return fail(error);
  }
}
