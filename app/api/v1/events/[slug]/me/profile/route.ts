import { recordRevision } from '@/lib/services/content';
import { updateProfile } from '@/lib/services/portal';
import { PRIVATE_CACHE, handle, json, parseBody } from '../../../../_lib/respond';
import { updateSpeakerProfileBody } from '../../../../_lib/schemas';
import { speakerApiSession, speakerProfilePayload } from '../../../../_lib/speaker';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const { slug } = await context.params;
    const { ctx, me } = await speakerApiSession(request, slug);
    return json({ data: await speakerProfilePayload(ctx, me) }, { headers: PRIVATE_CACHE });
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const { slug } = await context.params;
    const body = await parseBody(updateSpeakerProfileBody, request);
    const { ctx, me } = await speakerApiSession(request, slug);
    const current = await speakerProfilePayload(ctx, me);

    await recordRevision(ctx, 'participant', me.id, 'Edited their speaker profile through the API');
    const updated = await updateProfile(ctx, me.id, {
      displayName: body.displayName ?? me.displayName ?? '',
      pronouns: body.pronouns ?? me.pronouns ?? '',
      jobTitle: body.jobTitle ?? me.jobTitle ?? '',
      company: body.company ?? me.company ?? '',
      bioMarkdown: body.bioMarkdown ?? me.bioMarkdown ?? '',
      timezone: body.timezone ?? me.timezone ?? '',
      dietaryNotes: body.dietaryNotes ?? me.dietaryNotes ?? '',
      accessibilityNotes: body.accessibilityNotes ?? me.accessibilityNotes ?? '',
      links: body.links ?? me.links,
      phone: body.phone ?? current.phone ?? '',
      notifyEmail: body.notifyEmail ?? current.notifyEmail,
      notifySms: body.notifySms ?? current.notifySms,
    });

    return json({ data: await speakerProfilePayload(ctx, updated) }, { headers: PRIVATE_CACHE });
  });
}
