import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { form as formTable } from '@/db/schema';
import { normalizeEmail } from '@/lib/auth';
import { forbidden, invalid, notFound } from '@/lib/errors';
import type { AnswerMap } from '@/lib/forms/contract';
import { assertParticipantLimits } from '@/lib/services/forms';
import {
  ensureParticipant,
  isAcceptingSubmissions,
  linkPrimarySpeaker,
  loadPublicForm,
  saveParticipants,
  saveSubmission,
  validateParticipants,
  type ParticipantInput,
} from '@/lib/services/submissions';
import { requireSpeakerSession } from '../../../../../_lib/auth';
import { requireEvent } from '../../../../../_lib/queries';
import { PRIVATE_CACHE, handle, json, parseBody } from '../../../../../_lib/respond';
import { createSubmissionBody } from '../../../../../_lib/schemas';
import { emitWebhook } from '@/lib/webhooks';

export const dynamic = 'force-dynamic';

/**
 * The web CFP remains a cold, public flow that creates an account and sends a magic link. This API
 * write requires the speaker's session, so an agent action is attributable and cannot create or act
 * as an arbitrary email address.
 *
 * `formId` in the path accepts either the form's UUID or its slug, because a caller reading
 * `/api/v1/events/:slug` sees neither and will try whichever they were given.
 *
 * `F-4`, `F-6` and `F-7` all reach this handler through the form's own configuration rather than
 * through anything the caller says. That is deliberate: this route used to call `saveSubmission`
 * with no `targetType` and no participant stage at all, so a session-target form filed through the
 * API landed `submitted` with no session minted while the same form filed through the web landed
 * `accepted` with one — one requirement, two answers, depending on the door.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; formId: string }> },
) {
  return handle(async () => {
    const { slug, formId } = await context.params;
    const body = await parseBody(createSubmissionBody, request);
    const ctx = await requireSpeakerSession(request, slug);
    if (body.email && normalizeEmail(body.email) !== ctx.actor.email) {
      throw forbidden('The proposal email must match the signed-in speaker');
    }

    const event = await requireEvent(slug);
    const formSlug = await resolveFormSlug(event.id, formId);

    const bundle = await loadPublicForm(slug, formSlug);
    if (!bundle) throw notFound('That form');
    if (!isAcceptingSubmissions(bundle.form)) {
      throw invalid('This form is not accepting submissions right now');
    }

    if (body.participants && !bundle.form.collectsParticipants) {
      throw invalid('This form does not collect participants');
    }
    // The first person *is* the account, which is what stops a submission being filed under someone
    // else's address. The web flow overwrites the address silently because the box is disabled on
    // screen; an agent sent a different one on purpose and should be told, not corrected.
    if (body.participants && normalizeEmail(body.participants[0].email) !== ctx.actor.email) {
      throw forbidden('The first participant must be the signed-in speaker');
    }

    const people: ParticipantInput[] = (body.participants ?? []).map((person, index) => ({
      firstName: person.firstName,
      lastName: person.lastName,
      email: index === 0 ? ctx.actor.email : person.email,
      phone: person.phone ?? null,
      biography: person.biography ?? null,
      role: person.role,
    }));

    const collecting = bundle.form.collectsParticipants && people.length > 0;
    const isSubmit = body.mode === 'submit';

    if (collecting && isSubmit) {
      validateParticipants(
        bundle.participantFields,
        people,
        bundle.roles,
        bundle.form.maxParticipants,
      );
    }

    /**
     * `F-7` still applies when the caller sent no cast: the submitter is then the one and only
     * speaker, and a form asking for a moderator or a second panelist has to say so. Checked before
     * anything is written, so a request that cannot satisfy the form does not leave a submission —
     * or, on a session-target form, a session — behind it.
     */
    if (!collecting && bundle.form.collectsParticipants && isSubmit) {
      await assertParticipantLimits(bundle.form.id, ['speaker']);
    }

    const submitterName = collecting
      ? [people[0].firstName, people[0].lastName].filter(Boolean).join(' ').trim() || null
      : (body.name ?? ctx.actor.name);

    const participantId = await ensureParticipant(event.id, ctx.actor.userId, submitterName);

    const saved = await saveSubmission({
      eventId: event.id,
      formId: bundle.form.id,
      userId: ctx.actor.userId,
      fields: bundle.fields,
      values: body.answers as AnswerMap,
      limits: {
        allowDrafts: bundle.form.allowDrafts,
        maxSubmissionsPerUser: bundle.form.maxSubmissionsPerUser,
      },
      mode: body.mode,
      targetType: bundle.form.targetType,
    });

    if (collecting && isSubmit) {
      const ids = await saveParticipants({
        eventId: event.id,
        formId: bundle.form.id,
        submissionId: saved.id,
        submitterUserId: ctx.actor.userId,
        people,
      });
      // Measured against what actually landed rather than against what was posted — the same guard,
      // reading the same configuration, that the web submit and the portal's share flow run.
      await assertParticipantLimits(
        bundle.form.id,
        people.slice(0, ids.length).map((person) => person.role),
      );
    } else {
      await linkPrimarySpeaker(saved.id, participantId);
    }

    if (body.mode === 'submit') {
      await emitWebhook(event.id, 'submission.received', {
        submissionId: saved.id,
        ref: saved.displayRef,
        title: saved.title,
        status: saved.status,
        formId: bundle.form.id,
      });
      if (saved.status === 'accepted') {
        await emitWebhook(event.id, 'submission.decision_made', {
          submissionId: saved.id,
          decision: saved.status,
          note: null,
          decidedAt: new Date().toISOString(),
          automatic: true,
        });
      }
    }

    return json(
      {
        id: saved.id,
        ref: saved.displayRef,
        status: saved.status,
        title: saved.title,
      },
      { status: 201, headers: PRIVATE_CACHE },
    );
  });
}

async function resolveFormSlug(eventId: string, formId: string): Promise<string> {
  const db = getDb();
  const byId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(formId)
    ? await db.query.form.findFirst({ where: eq(formTable.id, formId) })
    : undefined;

  if (byId && byId.eventId === eventId) return byId.slug;
  if (byId) throw notFound('That form');
  return formId;
}
