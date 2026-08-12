import { env } from '../env';
import type { FieldMap } from './client';

/**
 * `Z-2`. Table names are configuration because an existing base already has its own conventions,
 * and forcing a rename would make the mirror useless to the team that already has views on it.
 *
 * The mirror is deliberately flat. Airtable has no joins, so a linked-record graph would be a
 * second schema to keep in sync; instead every row carries the names it needs and one `Cicero ID`
 * that makes the mapping back unambiguous.
 */

export type AirtableEntityType = 'submission' | 'speaker' | 'session';

export type AirtableTableMap = Record<AirtableEntityType, string>;

export const DEFAULT_TABLES: AirtableTableMap = {
  submission: 'Submissions',
  speaker: 'Speakers',
  session: 'Agenda',
};

export function configuredTables(): AirtableTableMap {
  return {
    submission: env('AIRTABLE_TABLE_SUBMISSIONS') ?? DEFAULT_TABLES.submission,
    speaker: env('AIRTABLE_TABLE_SPEAKERS') ?? DEFAULT_TABLES.speaker,
    session: env('AIRTABLE_TABLE_SESSIONS') ?? DEFAULT_TABLES.session,
  };
}

/**
 * The columns each table needs. Shown on the settings screen so an organizer can create them
 * before a first sync rather than discovering them one 422 at a time.
 */
export const EXPECTED_FIELDS: Record<AirtableEntityType, string[]> = {
  submission: [
    'Cicero ID',
    'Ref',
    'Title',
    'Status',
    'Track',
    'Format',
    'Level',
    'Speaker',
    'Speaker Email',
    'Abstract',
    'Submitted At',
  ],
  speaker: [
    'Cicero ID',
    'Name',
    'Email',
    'Job Title',
    'Company',
    'Pronouns',
    'Bio',
    'Accepted Sessions',
  ],
  session: [
    'Cicero ID',
    'Ref',
    'Title',
    'Status',
    'Track',
    'Room',
    'Starts At',
    'Ends At',
    'Speakers',
  ],
};

export type SubmissionMirrorRow = {
  id: string;
  ref: string;
  title: string;
  status: string;
  trackName: string | null;
  formatName: string | null;
  level: string | null;
  speakerName: string | null;
  speakerEmail: string | null;
  abstract: string | null;
  submittedAt: Date | null;
};

export type SpeakerMirrorRow = {
  id: string;
  name: string | null;
  email: string;
  jobTitle: string | null;
  company: string | null;
  pronouns: string | null;
  bio: string | null;
  acceptedSessions: string[];
};

export type SessionMirrorRow = {
  id: string;
  ref: string;
  title: string;
  status: string;
  trackName: string | null;
  roomName: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  speakerNames: string[];
};

export type MirrorRow = SubmissionMirrorRow | SpeakerMirrorRow | SessionMirrorRow;

/** Airtable stores dates as ISO strings; `null` clears a cell rather than writing "null". */
function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function submissionFields(row: SubmissionMirrorRow): FieldMap {
  return {
    'Cicero ID': row.id,
    Ref: row.ref,
    Title: row.title,
    Status: row.status,
    Track: row.trackName,
    Format: row.formatName,
    Level: row.level,
    Speaker: row.speakerName,
    'Speaker Email': row.speakerEmail,
    Abstract: row.abstract,
    'Submitted At': iso(row.submittedAt),
  };
}

export function speakerFields(row: SpeakerMirrorRow): FieldMap {
  return {
    'Cicero ID': row.id,
    Name: row.name,
    Email: row.email,
    'Job Title': row.jobTitle,
    Company: row.company,
    Pronouns: row.pronouns,
    Bio: row.bio,
    'Accepted Sessions': row.acceptedSessions.join(', '),
  };
}

export function sessionFields(row: SessionMirrorRow): FieldMap {
  return {
    'Cicero ID': row.id,
    Ref: row.ref,
    Title: row.title,
    Status: row.status,
    Track: row.trackName,
    Room: row.roomName,
    'Starts At': iso(row.startsAt),
    'Ends At': iso(row.endsAt),
    Speakers: row.speakerNames.join(', '),
  };
}

export function fieldsFor(entityType: AirtableEntityType, row: MirrorRow): FieldMap {
  switch (entityType) {
    case 'submission':
      return submissionFields(row as SubmissionMirrorRow);
    case 'speaker':
      return speakerFields(row as SpeakerMirrorRow);
    case 'session':
      return sessionFields(row as SessionMirrorRow);
  }
}
