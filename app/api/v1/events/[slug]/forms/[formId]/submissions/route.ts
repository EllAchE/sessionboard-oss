import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { form as formTable, user as userTable } from '@/db/schema';
import { grantRole, normalizeEmail, requestMagicLink } from '@/lib/auth';
import { invalid, notFound } from '@/lib/errors';
import type { AnswerMap } from '@/lib/forms/contract';
import {
  ensureParticipant,
  isAcceptingSubmissions,
  linkPrimarySpeaker,
  loadPublicForm,
  saveSubmission,
} from '@/lib/services/submissions';
import { requireEvent } from '../../../../../_lib/queries';
import { PRIVATE_CACHE, handle, json, parseBody } from '../../../../../_lib/respond';
import { createSubmissionBody } from '../../../../../_lib/schemas';

export const dynamic = 'force-dynamic';

/**
 * The one write on the public surface, and the only endpoint that needs no API key: a CFP is open
 * by definition, and requiring a key to submit to it would defeat the point. Every rule — the open
 * window, the per-user limit, field validation, the built-in/answers split — lives in
 * `lib/services/submissions.ts` and is the same code the web form runs, so the two cannot drift.
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

    const event = await requireEvent(slug);
    const formSlug = await resolveFormSlug(event.id, formId);

    const bundle = await loadPublicForm(slug, formSlug);
    if (!bundle) throw notFound('That scroll');
    if (!isAcceptingSubmissions(bundle.form)) {
      throw invalid('This scroll is not accepting petitions right now');
    }

    // No session on an API call, so the submitter is identified by email. The magic link this
    // sends is how they reach the portal afterwards, which is the same path the web form takes.
    const requested = await requestMagicLink({
      email: body.email,
      name: body.name ?? null,
      eventId: event.id,
      redirectTo: `/events/${slug}/portal`,
    });

    const account = await getDb().query.user.findFirst({
      where: eq(userTable.email, normalizeEmail(requested.email)),
    });
    if (!account) throw invalid('We could not enter that dispatch address on the rolls');

    await grantRole(account.id, event.id, 'speaker');
    const participantId = await ensureParticipant(event.id, account.id, body.name ?? null);

    const saved = await saveSubmission({
      eventId: event.id,
      formId: bundle.form.id,
      userId: account.id,
      fields: bundle.fields,
      values: body.answers as AnswerMap,
      limits: {
        allowDrafts: bundle.form.allowDrafts,
        maxSubmissionsPerUser: bundle.form.maxSubmissionsPerUser,
      },
      mode: 'submit',
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
  if (byId) throw notFound('That scroll');
  return formId;
}
