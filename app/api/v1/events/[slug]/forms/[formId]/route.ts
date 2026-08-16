import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { form as formTable } from '@/db/schema';
import { notFound } from '@/lib/errors';
import { isAcceptingSubmissions, loadPublicForm } from '@/lib/services/submissions';
import { formFieldPayload, formParticipantRolePayload } from '../../../../_lib/forms';
import { requireEvent } from '../../../../_lib/queries';
import { PUBLIC_CACHE, handle, isoOrNull, json } from '../../../../_lib/respond';
import { enforcePublicApiRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Public form contract so a speaker agent can prepare valid answers before authenticating a write. */
export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string; formId: string }> },
) {
  return handle(async () => {
    await enforcePublicApiRateLimit(request);
    const { slug, formId } = await context.params;
    const event = await requireEvent(slug);
    const formSlug = await resolveFormSlug(event.id, formId);
    const bundle = await loadPublicForm(slug, formSlug);
    if (!bundle || !isAcceptingSubmissions(bundle.form)) throw notFound('That form');

    return json(
      {
        data: {
          id: bundle.form.id,
          slug: bundle.form.slug,
          /**
           * `F-9`. The internal name is an organizer's own label — "CFP v3 (final)" — and this is
           * the public contract, so `name` carries the same string the submit page renders.
           * `loadPublicForm` already resolves the fallback, so a form whose organizer never set an
           * external title is unchanged. The raw field ships beside it for anyone who wants it.
           */
          name: bundle.form.externalTitle,
          externalTitle: bundle.form.externalTitle,
          pageHeading: bundle.form.pageHeading,
          showWelcome: bundle.form.showWelcome,
          introMarkdown: bundle.form.introMarkdown,
          opensAt: isoOrNull(bundle.form.opensAt),
          closesAt: isoOrNull(bundle.form.closesAt),
          allowDrafts: bundle.form.allowDrafts,
          maxSubmissionsPerUser: bundle.form.maxSubmissionsPerUser,
          targetType: bundle.form.targetType,
          collectsParticipants: bundle.form.collectsParticipants,
          maxParticipants: bundle.form.maxParticipants,
          fields: bundle.fields.map(formFieldPayload),
          participantFields: bundle.participantFields.map(formFieldPayload),
          roles: bundle.roles.map(formParticipantRolePayload),
        },
      },
      { headers: PUBLIC_CACHE },
    );
  });
}

/** Resolve the public slug first so a caller can safely pass either identifier without UUID casts. */
async function resolveFormSlug(eventId: string, identifier: string): Promise<string> {
  const forms = getDb().query.form;
  const bySlug = await forms.findFirst({
    where: and(eq(formTable.eventId, eventId), eq(formTable.slug, identifier)),
  });
  if (bySlug) return bySlug.slug;
  if (!UUID.test(identifier)) throw notFound('That form');

  const byId = await forms.findFirst({
    where: and(eq(formTable.eventId, eventId), eq(formTable.id, identifier)),
  });
  if (!byId) throw notFound('That form');
  return byId.slug;
}
