import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { form as formTable } from '@/db/schema';
import { notFound } from '@/lib/errors';
import { isAcceptingSubmissions, loadPublicForm } from '@/lib/services/submissions';
import { requireEvent } from '../../../../_lib/queries';
import { PUBLIC_CACHE, handle, isoOrNull, json } from '../../../../_lib/respond';

export const dynamic = 'force-dynamic';

/** Public form contract so a speaker agent can prepare valid answers before authenticating a write. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string; formId: string }> },
) {
  return handle(async () => {
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
          name: bundle.form.name,
          introMarkdown: bundle.form.introMarkdown,
          opensAt: isoOrNull(bundle.form.opensAt),
          closesAt: isoOrNull(bundle.form.closesAt),
          allowDrafts: bundle.form.allowDrafts,
          maxSubmissionsPerUser: bundle.form.maxSubmissionsPerUser,
          fields: bundle.fields,
        },
      },
      { headers: PUBLIC_CACHE },
    );
  });
}
