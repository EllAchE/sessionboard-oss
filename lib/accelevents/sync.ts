import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';
import { getDb } from '../../db/client';
import {
  accelevantsSync,
  event as eventTable,
  participant,
  participantRole,
  submission,
  user as userTable,
} from '../../db/schema';
import { appUrl, env } from '../env';
import { isAppError, notFound } from '../errors';
import { publicSpeakerHeadshotUrl } from '../speaker-headshot';
import { AccelEventsClient, liveClientConfig } from './client';
import { FakeAccelEventsGateway } from './fake';
import { dedupeByEmail, toSpeakerDto, type SpeakerSource } from './mapping';
import type { AccelEventsGateway } from './types';

/**
 * `N-1`. One direction only: we push accepted speakers into Accelevents and never read their state
 * back into ours. "One-way" is the author's word and the reason there is no reconciliation here —
 * an Accelevents edit is theirs to keep.
 *
 * Failures are recorded on the sync row and returned in the result rather than thrown away, because
 * the failure mode this feature exists to prevent is an organizer believing a speaker was comped
 * when they were not.
 */

export type AccelEventsMode = 'live' | 'fake' | 'disabled';

export function accelEventsMode(): AccelEventsMode {
  if (liveClientConfig()) return 'live';
  // The fake is a deliberate demo path (`N-1b`), not a fallback that hides a misconfiguration: it
  // is on only when asked for by name.
  return env('ACCELEVENTS_FAKE') === '1' ? 'fake' : 'disabled';
}

/** `null` when the integration is off, so every caller has one thing to check. */
export function getGateway(): AccelEventsGateway | null {
  const config = liveClientConfig();
  if (config) return new AccelEventsClient(config);
  if (accelEventsMode() === 'fake') {
    return new FakeAccelEventsGateway({
      eventUrl: env('ACCELEVENTS_EVENT_URL') ?? undefined,
    });
  }
  return null;
}

export type SpeakerCandidate = SpeakerSource & {
  displayName: string;
  /** Accepted talks this person is on, for the organizer list. */
  sessionTitles: string[];
  lastSync: {
    status: 'pending' | 'synced' | 'failed';
    remoteId: string | null;
    error: string | null;
    syncedAt: Date | null;
  } | null;
};

/**
 * Read-only Drizzle query living here rather than in `lib/services/**`, which another workstream
 * owns. Accepted submissions only: an unaccepted speaker does not get a comped ticket, so pushing
 * them would create exactly the mess the integration is meant to clear up.
 */
export async function listAcceptedSpeakers(eventId: string): Promise<SpeakerCandidate[]> {
  const db = getDb();

  const accepted = await db
    .select({ id: submission.id, title: submission.title })
    .from(submission)
    .where(and(eq(submission.eventId, eventId), eq(submission.status, 'accepted')));

  if (accepted.length === 0) return [];
  const submissionIds = accepted.map((row) => row.id);
  const titleById = new Map(accepted.map((row) => [row.id, row.title]));

  const roles = await db
    .select({
      submissionId: participantRole.submissionId,
      participantId: participantRole.participantId,
      position: participantRole.position,
      kind: participantRole.kind,
    })
    .from(participantRole)
    .where(inArray(participantRole.submissionId, submissionIds))
    .orderBy(asc(participantRole.position));

  if (roles.length === 0) return [];
  const participantIds = [...new Set(roles.map((row) => row.participantId))];

  const [eventRow, people, syncRows] = await Promise.all([
    db.query.event.findFirst({ where: eq(eventTable.id, eventId) }),
    db
      .select({
        id: participant.id,
        displayName: participant.displayName,
        pronouns: participant.pronouns,
        jobTitle: participant.jobTitle,
        company: participant.company,
        bioMarkdown: participant.bioMarkdown,
        headshotFileId: participant.headshotFileId,
        workflowStatus: participant.workflowStatus,
        links: participant.links,
        email: userTable.email,
        userName: userTable.name,
      })
      .from(participant)
      .innerJoin(userTable, eq(participant.userId, userTable.id))
      .where(inArray(participant.id, participantIds)),
    db
      .select()
      .from(accelevantsSync)
      .where(and(eq(accelevantsSync.eventId, eventId), isNotNull(accelevantsSync.participantId)))
      .orderBy(asc(accelevantsSync.createdAt)),
  ]);

  const latestSync = new Map<string, (typeof syncRows)[number]>();
  for (const row of syncRows) {
    if (row.participantId) latestSync.set(row.participantId, row);
  }

  const titlesByParticipant = new Map<string, string[]>();
  for (const role of roles) {
    const list = titlesByParticipant.get(role.participantId) ?? [];
    const title = titleById.get(role.submissionId);
    if (title) list.push(title);
    titlesByParticipant.set(role.participantId, list);
  }

  return people
    .map((person, index) => {
      const sync = latestSync.get(person.id);
      const name = person.displayName ?? person.userName;
      return {
        participantId: person.id,
        email: person.email,
        name,
        displayName: name ?? person.email,
        jobTitle: person.jobTitle,
        company: person.company,
        bioMarkdown: person.bioMarkdown,
        pronouns: person.pronouns,
        headshotUrl: headshotUrl(eventRow?.slug, person),
        links: person.links ?? [],
        position: index,
        sessionTitles: titlesByParticipant.get(person.id) ?? [],
        lastSync: sync
          ? {
              status: sync.status,
              remoteId: sync.remoteId,
              error: sync.error,
              syncedAt: sync.syncedAt,
            }
          : null,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * The headshot Accelevents is given is the public one — `/embed/{slug}/headshot/{fileId}`, the same
 * URL the embeds and the public speaker directory serve. Accelevents fetches the image from their
 * own infrastructure with no session of ours, so it has to be absolute and reachable without one,
 * and that route is the only one in the app that is both by design.
 *
 * It serves confirmed participants only, so `publicSpeakerHeadshotUrl` returns `null` for a speaker
 * whose talk is accepted but whose profile is not confirmed yet. That speaker still pushes, without
 * a headshot — which is the behaviour that was already documented here, now reached honestly rather
 * than by handing over a link that 404s.
 */
function headshotUrl(
  eventSlug: string | undefined,
  person: { workflowStatus: string; headshotFileId: string | null },
): string | null {
  return publicSpeakerHeadshotUrl({
    origin: appUrl(),
    eventSlug,
    workflowStatus: person.workflowStatus,
    headshotFileId: person.headshotFileId,
  });
}

export type PushOutcome = {
  participantId: string;
  email: string;
  name: string;
  status: 'created' | 'already_there' | 'skipped_duplicate' | 'failed';
  remoteId: string | null;
  message: string | null;
};

export type PushSummary = {
  mode: AccelEventsMode;
  eventUrl: string | null;
  created: number;
  alreadyThere: number;
  skipped: number;
  failed: number;
  /** Which header Accelevents actually accepted — the ambiguity in §7, resolved at runtime. */
  authHeaderUsed: string | null;
  results: PushOutcome[];
};

export type PushOptions = {
  /** Restricts the push to these participants; everything accepted when absent. */
  participantIds?: string[];
  /** Re-pushes people whose last sync succeeded. Off, because `4068906` makes that a guaranteed reject. */
  includeAlreadySynced?: boolean;
};

export async function pushAcceptedSpeakers(
  eventId: string,
  options: PushOptions = {},
): Promise<PushSummary> {
  const gateway = getGateway();
  const mode = accelEventsMode();

  if (!gateway) {
    return {
      mode,
      eventUrl: null,
      created: 0,
      alreadyThere: 0,
      skipped: 0,
      failed: 0,
      authHeaderUsed: null,
      results: [],
    };
  }

  const db = getDb();
  const eventRow = await db.query.event.findFirst({
    where: eq(eventTable.id, eventId),
  });
  if (!eventRow) throw notFound('That event');

  const all = await listAcceptedSpeakers(eventId);
  const selected = options.participantIds
    ? all.filter((row) => options.participantIds!.includes(row.participantId))
    : all;

  const eligible = options.includeAlreadySynced
    ? selected
    : selected.filter((row) => row.lastSync?.status !== 'synced');

  // Two levels of dedupe, because `4068906` rejects on either. Within the batch first — a
  // co-speaker on two accepted talks appears twice — then against what we have already pushed.
  const { unique, duplicates } = dedupeByEmail(eligible);

  const results: PushOutcome[] = duplicates.map((row) => ({
    participantId: row.participantId,
    email: row.email,
    name: row.displayName,
    status: 'skipped_duplicate' as const,
    remoteId: null,
    message: 'Another accepted speaker on this event uses the same email address',
  }));

  let authHeaderUsed: string | null = null;

  for (const candidate of unique) {
    const dto = toSpeakerDto(candidate);

    try {
      const pushed = await gateway.createSpeaker(dto);
      authHeaderUsed = pushed.authHeaderUsed;

      await db.insert(accelevantsSync).values({
        eventId,
        participantId: candidate.participantId,
        remoteId: pushed.remoteId,
        status: 'synced',
        error: pushed.outcome === 'duplicate' ? 'Speaker already exists in Accelevents' : null,
        requestBody: dto,
        responseBody: pushed.response as Record<string, unknown>,
        syncedAt: new Date(),
      });

      results.push({
        participantId: candidate.participantId,
        email: candidate.email,
        name: candidate.displayName,
        status: pushed.outcome === 'duplicate' ? 'already_there' : 'created',
        remoteId: pushed.remoteId,
        message:
          pushed.outcome === 'duplicate'
            ? 'Already in Accelevents with this email; left untouched'
            : null,
      });
    } catch (error) {
      const message = isAppError(error) ? error.message : 'Accelevents rejected this speaker';
      if (!isAppError(error)) console.error(error instanceof Error ? error.message : String(error));

      await db.insert(accelevantsSync).values({
        eventId,
        participantId: candidate.participantId,
        remoteId: null,
        status: 'failed',
        error: message,
        requestBody: dto,
        responseBody: null,
        syncedAt: null,
      });

      results.push({
        participantId: candidate.participantId,
        email: candidate.email,
        name: candidate.displayName,
        status: 'failed',
        remoteId: null,
        message,
      });
    }
  }

  return {
    mode,
    eventUrl: gateway.eventUrl,
    created: results.filter((row) => row.status === 'created').length,
    alreadyThere: results.filter((row) => row.status === 'already_there').length,
    skipped: results.filter((row) => row.status === 'skipped_duplicate').length,
    failed: results.filter((row) => row.status === 'failed').length,
    authHeaderUsed,
    results,
  };
}

export type SyncLogEntry = {
  id: string;
  participantId: string | null;
  status: 'pending' | 'synced' | 'failed';
  remoteId: string | null;
  error: string | null;
  syncedAt: Date | null;
  createdAt: Date;
};

export async function listSyncLog(eventId: string, limit = 50): Promise<SyncLogEntry[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(accelevantsSync)
    .where(and(eq(accelevantsSync.eventId, eventId), isNotNull(accelevantsSync.participantId)))
    .orderBy(asc(accelevantsSync.createdAt));

  return rows
    .slice(-limit)
    .reverse()
    .map((row) => ({
      id: row.id,
      participantId: row.participantId,
      status: row.status,
      remoteId: row.remoteId,
      error: row.error,
      syncedAt: row.syncedAt,
      createdAt: row.createdAt,
    }));
}

/** Cheapest call that proves the key and the event slug are both right. */
export async function testConnection(): Promise<{
  ok: boolean;
  message: string;
  authHeaderUsed?: string;
}> {
  const gateway = getGateway();
  if (!gateway) {
    return {
      ok: false,
      message: 'Set ACCELEVENTS_API_KEY and ACCELEVENTS_EVENT_URL to enable this',
    };
  }

  try {
    const listed = await gateway.listSpeakers({ size: 1 });
    return {
      ok: true,
      message: `Connected to ${gateway.eventUrl} — ${listed.total} speaker${listed.total === 1 ? '' : 's'} on file`,
      authHeaderUsed: listed.authHeaderUsed,
    };
  } catch (error) {
    return {
      ok: false,
      message: isAppError(error) ? error.message : 'Could not reach Accelevents',
    };
  }
}
