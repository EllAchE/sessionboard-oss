import type { contentApprovalStatus, speakerWorkflowStatus } from '../db/schema';

type ContentApprovalStatus = (typeof contentApprovalStatus.enumValues)[number];
type SpeakerWorkflowStatus = (typeof speakerWorkflowStatus.enumValues)[number];

/**
 * Publishing a session is necessary for attendees to see it, and not sufficient. Two other gates
 * sit in front of the public read model in `app/embed/queries.ts`:
 *
 * - the session's submission must be content-`approved`, or the session row is dropped entirely;
 * - each speaker must be `confirmed`, or that speaker is dropped from the session's byline.
 *
 * Both gates are deliberate. Neither used to be visible from the organizer's side, so an agenda
 * reading "0 draft / 4 published" sat next to a public page reading "3 published sessions" with
 * nothing anywhere to say which one was missing or why. This is that explanation, restated in
 * TypeScript for the organizer board — the public read model still enforces the gates in SQL, so
 * the two are kept in step by hand and each side points at the other.
 */

export type PublicHold =
  | { kind: 'content_status'; status: Exclude<ContentApprovalStatus, 'approved'> }
  | { kind: 'unconfirmed_speakers'; names: string[] };

export type HoldInput = {
  status: string;
  contentStatus: ContentApprovalStatus | null;
  speakers: Array<{ name: string; workflowStatus: SpeakerWorkflowStatus }>;
};

/**
 * Why the public will not show this session as the organizer sees it here. Empty for anything not
 * published — a draft is withheld on purpose and saying so twice is noise.
 */
export function publicHolds(session: HoldInput): PublicHold[] {
  if (session.status !== 'published') return [];

  const holds: PublicHold[] = [];

  // `null` is a session typed straight into the agenda with no submission behind it. Nothing gates
  // it, so nothing is held.
  if (session.contentStatus !== null && session.contentStatus !== 'approved') {
    holds.push({ kind: 'content_status', status: session.contentStatus });
  }

  const unconfirmed = session.speakers
    .filter((speaker) => speaker.workflowStatus !== 'confirmed')
    .map((speaker) => speaker.name);
  if (unconfirmed.length > 0) holds.push({ kind: 'unconfirmed_speakers', names: unconfirmed });

  return holds;
}

/** A hold spelled out for the organizer, including the thing they can go and do about it. */
export function describeHold(hold: PublicHold): string {
  if (hold.kind === 'content_status') {
    return hold.status === 'in_review'
      ? 'Attendees cannot see this session: its copy is still in review. Approve it under Content.'
      : 'Attendees cannot see this session: its copy has changes requested. Approve it under Content.';
  }

  const [first, ...rest] = hold.names;
  const who =
    rest.length === 0
      ? first
      : rest.length === 1
        ? `${first} and ${rest[0]}`
        : `${first} and ${rest.length} others`;
  return `${who} ${hold.names.length === 1 ? 'is' : 'are'} left off the public listing until they confirm on the speaker roster.`;
}

/** Does anything here stop the session itself reaching attendees, as opposed to trimming its byline? */
export function withholdsSession(holds: PublicHold[]): boolean {
  return holds.some((hold) => hold.kind === 'content_status');
}
