import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { form as formTable } from '@/db/schema';
import { normalizeEmail } from '@/lib/auth';
import { forbidden, invalid, notFound } from '@/lib/errors';
import type { AnswerMap } from '@/lib/forms/contract';
import {
  ensureParticipant,
  isAcceptingSubmissions,
  linkPrimarySpeaker,
  loadPublicForm,
  saveSubmission,
} from '@/lib/services/submissions';
import { requireSpeakerSession } from '../../../../../_lib/auth';
import { requireEvent } from '../../../../../_lib/queries';
import { PRIVATE_CACHE, handle, json, parseBody } from '../../../../../_lib/respond';
import { createSubmissionBody } from '../../../../../_lib/schemas';

export const dynamic = 'force-dynamic';

/**
 * The web CFP remains a cold, public flow that creates an account and sends a magic link. This API
 * write requires the speaker's session, so an agent action is attributable and cannot create or act
 * as an arbitrary email address.
 *
 * `formId` in the path accepts either the form's UUID or its slug, because a caller reading
 * `/api/v1/events/:slug` sees neither and will try whichever they were given.
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

    const participantId = await ensureParticipant(
      event.id,
      ctx.actor.userId,
      body.name ?? ctx.actor.name,
    );

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
    });

    await linkPrimarySpeaker(saved.id, participantId);

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
