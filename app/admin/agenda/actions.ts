'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { scheduledSession, sessionFormat, submission } from '@/db/schema';
import { requireCapability } from '@/lib/context';
import { conflict, invalid, toPublicError } from '@/lib/errors';
import { mutateAgendaAtomically, type AgendaTransaction } from '@/lib/services/agenda-guard';
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

function placementTimes(input: PlacementInput): { startsAt: Date; endsAt: Date } {
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw invalid('That slot is not a valid time');
  }
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw invalid('An oration must conclude after it begins');
  }
  return { startsAt, endsAt };
}

async function placeSession(
  transaction: AgendaTransaction,
  eventId: string,
  input: PlacementInput,
): Promise<string> {
  const { startsAt, endsAt } = placementTimes(input);

  if (input.kind === 'session') {
    const existing = await transaction.query.scheduledSession.findFirst({
      where: and(eq(scheduledSession.id, input.targetId), eq(scheduledSession.eventId, eventId)),
    });
    if (!existing) throw conflict('That oration is no longer inscribed in the fasti');

    await transaction
      .update(scheduledSession)
      .set({ roomId: input.roomId, startsAt, endsAt, updatedAt: new Date() })
      .where(and(eq(scheduledSession.id, existing.id), eq(scheduledSession.eventId, eventId)));
    return existing.id;
  }

  const source = await transaction.query.submission.findFirst({
    where: and(eq(submission.id, input.targetId), eq(submission.eventId, eventId)),
  });
  if (!source) throw conflict('That petition is no longer before the Forum');

  const already = await transaction.query.scheduledSession.findFirst({
    where: and(
      eq(scheduledSession.eventId, eventId),
      eq(scheduledSession.submissionId, source.id),
    ),
  });
  if (already) {
    await transaction
      .update(scheduledSession)
      .set({ roomId: input.roomId, startsAt, endsAt, updatedAt: new Date() })
      .where(and(eq(scheduledSession.id, already.id), eq(scheduledSession.eventId, eventId)));
    return already.id;
  }

  const [created] = await transaction
    .insert(scheduledSession)
    .values({
      eventId,
      submissionId: source.id,
      ref: await allocateSessionRef(eventId, transaction),
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
  return created.id;
}

/**
 * The drop. A rail card becomes a real row here; a block already on the grid is moved in place. The
 * same action serves both because the organizer performed one gesture and should get one outcome.
 */
export async function placeSessionAction(
  input: PlacementInput,
): Promise<ActionResult<{ sessionId: string }>> {
  try {
    const ctx = await authorize();
    const sessionId = await mutateAgendaAtomically(ctx.eventId, async (transaction) => {
      const changedSessionId = await placeSession(transaction, ctx.eventId, input);
      return { data: changedSessionId, changedSessionIds: [changedSessionId] };
    });

    await notifyIfPublished(sessionId);
    revalidate();
    return { ok: true, data: { sessionId } };
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
    if (!existing) return { ok: false, error: 'That oration is no longer inscribed in the fasti' };

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
  /** Present when scheduling an accepted proposal through the non-drag path. */
  sourceSubmissionId?: string | null;
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

    const title = input.title.trim();
    if (!title) return { ok: false, error: 'An oration needs a title' };

    const startsAt = input.startsAt ? new Date(input.startsAt) : null;
    const endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if (
      (startsAt && Number.isNaN(startsAt.getTime())) ||
      (endsAt && Number.isNaN(endsAt.getTime()))
    ) {
      return { ok: false, error: 'That slot is not a valid time' };
    }
    if (!startsAt && endsAt) return { ok: false, error: 'Give the oration an opening hour' };
    if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
      return { ok: false, error: 'An oration must conclude after it begins' };
    }

    const sessionId = await mutateAgendaAtomically(ctx.eventId, async (transaction) => {
      let resolvedEndsAt = endsAt;
      if (startsAt && !resolvedEndsAt) {
        const minutes = input.formatId
          ? ((
              await transaction.query.sessionFormat.findFirst({
                where: and(
                  eq(sessionFormat.id, input.formatId),
                  eq(sessionFormat.eventId, ctx.eventId),
                ),
              })
            )?.durationMinutes ?? DEFAULT_SESSION_MINUTES)
          : DEFAULT_SESSION_MINUTES;
        resolvedEndsAt = new Date(startsAt.getTime() + minutes * 60_000);
      }

      const patch = {
        title,
        descriptionMarkdown: input.descriptionMarkdown?.trim() || null,
        roomId: input.roomId,
        trackId: input.trackId,
        formatId: input.formatId,
        startsAt,
        endsAt: resolvedEndsAt,
        ceuCredits: input.ceuCredits?.trim() || null,
        clientId: input.clientId?.trim() || null,
        updatedAt: new Date(),
      };

      if (input.sessionId) {
        const existing = await transaction.query.scheduledSession.findFirst({
          where: and(
            eq(scheduledSession.id, input.sessionId),
            eq(scheduledSession.eventId, ctx.eventId),
          ),
        });
        if (!existing) throw conflict('That oration is no longer inscribed in the fasti');

        await transaction
          .update(scheduledSession)
          .set(patch)
          .where(
            and(eq(scheduledSession.id, existing.id), eq(scheduledSession.eventId, ctx.eventId)),
          );
        return { data: existing.id, changedSessionIds: [existing.id] };
      }

      const source = input.sourceSubmissionId
        ? await transaction.query.submission.findFirst({
            where: and(
              eq(submission.id, input.sourceSubmissionId),
              eq(submission.eventId, ctx.eventId),
              eq(submission.status, 'accepted'),
            ),
          })
        : null;
      if (input.sourceSubmissionId && !source) {
        throw conflict('That accepted petition is no longer on the rolls');
      }

      if (source) {
        const existing = await transaction.query.scheduledSession.findFirst({
          where: and(
            eq(scheduledSession.eventId, ctx.eventId),
            eq(scheduledSession.submissionId, source.id),
          ),
        });
        if (existing) throw conflict('That petition is already inscribed in the fasti');
      }

      const [created] = await transaction
        .insert(scheduledSession)
        .values({
          eventId: ctx.eventId,
          submissionId: source?.id ?? null,
          ref: await allocateSessionRef(ctx.eventId, transaction),
          status: 'draft',
          icsUid: mintIcsUid(),
          ...patch,
        })
        .returning();
      return { data: created.id, changedSessionIds: [created.id] };
    });

    await notifyIfPublished(sessionId);
    revalidate();
    return { ok: true, data: { sessionId } };
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
    const outcome = await mutateAgendaAtomically(ctx.eventId, async (transaction) => {
      const existing = await transaction.query.scheduledSession.findFirst({
        where: and(eq(scheduledSession.id, sessionId), eq(scheduledSession.eventId, ctx.eventId)),
      });
      if (!existing) throw conflict('That oration is no longer inscribed in the fasti');
      if (existing.status === status) {
        return {
          data: { changed: false, wasVisible: existing.status === 'published' },
          changedSessionIds: [],
        };
      }

      if (status === 'published' && (!existing.startsAt || !existing.endsAt || !existing.roomId)) {
        throw invalid('Give the oration a chamber and an hour before proclaiming it');
      }

      await transaction
        .update(scheduledSession)
        .set({ status, updatedAt: new Date() })
        .where(and(eq(scheduledSession.id, sessionId), eq(scheduledSession.eventId, ctx.eventId)));
      return {
        data: { changed: true, wasVisible: existing.status === 'published' },
        changedSessionIds: [sessionId],
      };
    });
    if (outcome.changed && status === 'published') await notifyIfPublished(sessionId, {}, graph);
    else if (outcome.changed && outcome.wasVisible) {
      await notifyIfPublished(sessionId, { cancel: true }, graph);
    }

    revalidate();
    return { ok: true, data: null };
  } catch (error) {
    return fail(error);
  }
}

/** Batched so notification delivery does not fan out without a bound. */
const PUBLISH_BATCH_SIZE = 25;
const MAX_PUBLISH_SESSION_COUNT = 250;

/** `A-6` in bulk: the organizer finishes rearranging and releases the whole day at once. */
export async function publishAllAction(
  sessionIds: string[],
): Promise<ActionResult<{ published: number; skipped: number }>> {
  try {
    const ctx = await authorize();
    const uniqueSessionIds = [...new Set(sessionIds)];
    if (uniqueSessionIds.length > MAX_PUBLISH_SESSION_COUNT) {
      throw invalid(`Proclaim at most ${MAX_PUBLISH_SESSION_COUNT} orations at once`);
    }

    const publishedSessionIds = await mutateAgendaAtomically(ctx.eventId, async (transaction) => {
      for (const sessionId of uniqueSessionIds) {
        const existing = await transaction.query.scheduledSession.findFirst({
          where: and(eq(scheduledSession.id, sessionId), eq(scheduledSession.eventId, ctx.eventId)),
        });
        if (!existing || existing.status !== 'draft') {
          throw conflict(
            'The fasti changed while this day was being proclaimed; refresh and try again',
          );
        }
        if (!existing.startsAt || !existing.endsAt || !existing.roomId) {
          throw invalid('Every oration needs a chamber and an hour before proclaiming the day');
        }

        await transaction
          .update(scheduledSession)
          .set({ status: 'published', updatedAt: new Date() })
          .where(
            and(eq(scheduledSession.id, sessionId), eq(scheduledSession.eventId, ctx.eventId)),
          );
      }
      return { data: uniqueSessionIds, changedSessionIds: uniqueSessionIds };
    });

    const graph = await loadRecipientGraph(ctx.eventId);
    for (let i = 0; i < publishedSessionIds.length; i += PUBLISH_BATCH_SIZE) {
      const batch = publishedSessionIds.slice(i, i + PUBLISH_BATCH_SIZE);
      await Promise.all(batch.map((sessionId) => notifyIfPublished(sessionId, {}, graph)));
    }
    revalidate();
    return { ok: true, data: { published: publishedSessionIds.length, skipped: 0 } };
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
    const ctx = await authorize();
    const sessionIds = await mutateAgendaAtomically(ctx.eventId, async (transaction) => {
      const changedSessionIds: string[] = [];
      for (const placement of placements) {
        changedSessionIds.push(await placeSession(transaction, ctx.eventId, placement));
      }
      return { data: changedSessionIds, changedSessionIds };
    });

    for (const sessionId of new Set(sessionIds)) await notifyIfPublished(sessionId);
    revalidate();
    return { ok: true, data: { applied: placements.length, failed: 0 } };
  } catch (error) {
    return fail(error);
  }
}
