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

/** Public form contract so a speaker agent can prepare valid answers before authenticating a write. */
export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string; formId: string }> },
) {
  return handle(async () => {
    await enforcePublicApiRateLimit(request);
    const { slug, formId } = await context.params;
    const event = await requireEvent(slug);
    const formRow = await getDb().query.form.findFirst({
      where: and(eq(formTable.eventId, event.id), eq(formTable.id, formId)),
    });
    const bundle = await loadPublicForm(slug, formRow?.slug ?? formId);
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
