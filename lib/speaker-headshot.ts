/**
 * Where a speaker headshot is served from. Pure, and deliberately the only place that spells the
 * path out: the public read model, the REST surface and the Accelevents push all needed the same
 * URL, each wrote its own, and two of the three ended up pointing at an `/api/files/{id}` route
 * that has never existed.
 *
 * The one that does exist is `app/embed/[slug]/headshot/[fileId]`. It is unauthenticated because an
 * iframe on somebody else's site carries no session, and it proves access structurally instead: the
 * file id must belong to a `confirmed` participant on the event named in the path, so it cannot be
 * walked sideways into a deck or a contract. That is the whole reason the gate below exists — a URL
 * is only handed out when that route will actually serve it.
 */

export function speakerHeadshotPath(
  eventSlug: string | null | undefined,
  fileId: string | null | undefined,
): string | null {
  if (!eventSlug || !fileId) return null;
  return `/embed/${encodeURIComponent(eventSlug)}/headshot/${fileId}`;
}

/**
 * The absolute form, for readers outside a request — an API consumer, or Accelevents fetching the
 * image onto their own speaker page. `null` for a participant who is not confirmed yet: their
 * headshot is not public, and a link that 404s is worse than an honest absence.
 */
export function publicSpeakerHeadshotUrl(params: {
  origin: string;
  eventSlug: string | null | undefined;
  workflowStatus: string;
  headshotFileId: string | null | undefined;
}): string | null {
  if (params.workflowStatus !== 'confirmed') return null;
  const path = speakerHeadshotPath(params.eventSlug, params.headshotFileId);
  return path ? `${params.origin}${path}` : null;
}
