import { describe, expect, it } from 'vitest';
import {
  attributeEventFiles,
  type EventFileRow,
  type FileIndexInput,
  type FileRecord,
} from './files';

/**
 * `SPK-10`, `CNT-13`. The file library rendered a speaker's deck with an empty Submission and an
 * empty Status, which on screen is indistinguishable from a file nobody uploaded — so the bug was
 * invisible exactly where it mattered. These cases pin down the three ways an upload reaches its
 * session, the one case where it must not, and the fact that a task upload has a status of its own.
 *
 * File ids are real uuids because attribution finds most of them by scanning an answer map for
 * uuid-shaped strings; a readable placeholder would silently take the direct-`fileId` path instead
 * and leave the interesting half of the lookup untested.
 */

const ADA = 'participant-ada';
const GRACE = 'participant-grace';
const PANEL = 'submission-panel';
const SOLO = 'submission-solo';

const DECK = '11111111-1111-4111-8111-111111111111';
const DECK_V2 = '22222222-2222-4222-8222-222222222222';
const PHOTO = '33333333-3333-4333-8333-333333333333';

function record(patch: Partial<FileRecord> & { id: string }): FileRecord {
  return {
    eventId: 'event-1',
    storageKey: `key/${patch.id}`,
    filename: 'slides.pdf',
    contentType: 'application/pdf',
    sizeBytes: 2048,
    uploadedByUserId: 'user-ada',
    rootFileId: null,
    version: 1,
    createdAt: new Date('2026-08-01T09:00:00Z'),
    ...patch,
  };
}

function index(patch: Partial<FileIndexInput> = {}): EventFileRow[] {
  return attributeEventFiles({
    files: [record({ id: DECK })],
    submissions: [
      {
        id: PANEL,
        ref: 4,
        title: 'Scaling the panel',
        status: 'accepted',
        answers: {},
        participantId: GRACE,
        ownerDisplayName: null,
        ownerName: 'Grace Hopper',
        ownerEmail: 'grace@example.com',
      },
      {
        id: SOLO,
        ref: 9,
        title: 'A solo talk',
        status: 'waitlisted',
        answers: {},
        participantId: ADA,
        ownerDisplayName: null,
        ownerName: 'Ada Lovelace',
        ownerEmail: 'ada@example.com',
      },
    ],
    taskUploads: [],
    headshots: [],
    speakingRoles: [],
    uploaders: [{ id: 'user-ada', displayName: null, name: 'Ada Lovelace', email: 'ada@example.com' }],
    commentCounts: new Map(),
    ...patch,
  });
}

type TaskUpload = FileIndexInput['taskUploads'][number];

/** A speaker's finished file-upload task, holding its file the way the portal writes it. */
function taskUpload(patch: Partial<TaskUpload> = {}): TaskUpload {
  return {
    fileId: DECK,
    answers: { __fileIds: [DECK] },
    participantId: ADA,
    submissionId: null,
    pinnedSubmissionId: null,
    taskName: 'Upload your slides',
    taskStatus: 'completed',
    ownerDisplayName: null,
    ownerName: 'Ada Lovelace',
    ownerEmail: 'ada@example.com',
    ...patch,
  };
}

describe('speaker-task uploads carry their association', () => {
  it('takes the session from the assignment when the task is scoped to one', () => {
    const [row] = index({ taskUploads: [taskUpload({ submissionId: PANEL })] });

    expect(row.source).toBe('task');
    expect(row.submissionId).toBe(PANEL);
    expect(row.submissionRef).toContain('4');
    expect(row.submissionTitle).toBe('Scaling the panel');
    expect(row.submissionStatus).toBe('accepted');
    expect(row.submissionInferred).toBe(false);
  });

  it('falls back to the session the task itself is pinned to', () => {
    const [row] = index({ taskUploads: [taskUpload({ pinnedSubmissionId: SOLO })] });

    expect(row.submissionId).toBe(SOLO);
    expect(row.submissionInferred).toBe(false);
  });

  /**
   * The case the library got wrong: a contact-scoped task is about the person, so neither the
   * assignment nor the task names a session and the column was simply left blank.
   */
  it('falls back to the speaker’s only session, and admits that it did', () => {
    const [row] = index({
      taskUploads: [taskUpload()],
      speakingRoles: [{ participantId: ADA, submissionId: SOLO }],
    });

    expect(row.submissionId).toBe(SOLO);
    expect(row.submissionTitle).toBe('A solo talk');
    expect(row.submissionInferred).toBe(true);
  });

  it('names no session when the speaker is on more than one', () => {
    const [row] = index({
      taskUploads: [taskUpload()],
      speakingRoles: [
        { participantId: ADA, submissionId: SOLO },
        { participantId: ADA, submissionId: PANEL },
      ],
    });

    expect(row.submissionId).toBeNull();
    expect(row.submissionInferred).toBe(false);
  });

  it('never infers over a session the upload actually names', () => {
    const [row] = index({
      taskUploads: [taskUpload({ submissionId: PANEL })],
      speakingRoles: [{ participantId: ADA, submissionId: SOLO }],
    });

    expect(row.submissionId).toBe(PANEL);
    expect(row.submissionInferred).toBe(false);
  });

  it('carries the task name and the assignment status, so neither column is blank', () => {
    const [row] = index({ taskUploads: [taskUpload({ taskStatus: 'in_progress' })] });

    expect(row.taskName).toBe('Upload your slides');
    expect(row.taskStatus).toBe('in_progress');
    expect(row.ownerName).toBe('Ada Lovelace');
    expect(row.participantId).toBe(ADA);
  });

  /** The assignment's `fileId` only ever names the newest upload; the rest live in the answer map. */
  it('attributes a file the assignment holds only through its answers', () => {
    const [row] = index({
      taskUploads: [taskUpload({ fileId: null, submissionId: PANEL })],
    });

    expect(row.source).toBe('task');
    expect(row.submissionId).toBe(PANEL);
  });
});

describe('metadata a speaker record needs', () => {
  it('resolves the uploader, who is not always the speaker the file belongs to', () => {
    const [row] = index({
      files: [record({ id: PHOTO, filename: 'ada.jpg', uploadedByUserId: 'user-organizer' })],
      headshots: [
        {
          fileId: PHOTO,
          participantId: ADA,
          ownerDisplayName: null,
          ownerName: 'Ada Lovelace',
          ownerEmail: 'ada@example.com',
        },
      ],
      uploaders: [
        { id: 'user-organizer', displayName: null, name: 'Hedy Lamarr', email: 'hedy@example.com' },
      ],
    });

    expect(row.source).toBe('headshot');
    expect(row.participantId).toBe(ADA);
    expect(row.ownerName).toBe('Ada Lovelace');
    expect(row.uploaderName).toBe('Hedy Lamarr');
    expect(row.filename).toBe('ada.jpg');
    expect(row.createdAt.toISOString()).toBe('2026-08-01T09:00:00.000Z');
  });

  /*
    `CNT-S3`. The account name and this event's name for the same person can differ, and did: a
    speaker renamed on one conference kept her account's old name on every file she owned or
    uploaded. Both columns read the event's name now.
  */
  it('files a renamed speaker under the name this event gave her', () => {
    const [row] = index({
      files: [record({ id: PHOTO, filename: 'priya.jpg', uploadedByUserId: 'user-priya' })],
      submissions: [],
      headshots: [
        {
          fileId: PHOTO,
          participantId: ADA,
          ownerDisplayName: 'Priya Raman',
          ownerName: 'Marcus Vitruvius Pollio',
          ownerEmail: 'vitruvius@example.com',
        },
      ],
      uploaders: [
        {
          id: 'user-priya',
          displayName: 'Priya Raman',
          name: 'Marcus Vitruvius Pollio',
          email: 'vitruvius@example.com',
        },
      ],
    });

    expect(row.ownerName).toBe('Priya Raman');
    expect(row.uploaderName).toBe('Priya Raman');
  });

  it('leaves the uploader null rather than guessing when the account is gone', () => {
    const [row] = index({
      files: [record({ id: DECK, uploadedByUserId: null })],
      uploaders: [],
    });

    expect(row.uploaderName).toBeNull();
    expect(row.uploaderEmail).toBeNull();
  });

  /** A replacement is attached to nothing; the lineage is what keeps it on the speaker's record. */
  it('keeps a superseded upload’s attribution across every version', () => {
    const rows = index({
      files: [
        record({ id: DECK, version: 1 }),
        record({ id: DECK_V2, version: 2, rootFileId: DECK }),
      ],
      taskUploads: [
        taskUpload({ fileId: DECK_V2, answers: { __fileIds: [DECK_V2] }, submissionId: PANEL }),
      ],
    });

    expect(rows.map((row) => row.submissionId)).toEqual([PANEL, PANEL]);
    expect(rows.map((row) => row.participantId)).toEqual([ADA, ADA]);
    expect(rows.map((row) => row.versionCount)).toEqual([2, 2]);
    expect(rows.map((row) => row.isCurrent)).toEqual([false, true]);
  });

  it('attributes a submission answer to its own submission, over any task', () => {
    const [row] = index({
      submissions: [
        {
          id: PANEL,
          ref: 4,
          title: 'Scaling the panel',
          status: 'accepted',
          answers: { deck: DECK },
          participantId: GRACE,
          ownerDisplayName: null,
          ownerName: 'Grace Hopper',
          ownerEmail: 'grace@example.com',
        },
      ],
      taskUploads: [taskUpload()],
    });

    expect(row.source).toBe('submission');
    expect(row.participantId).toBe(GRACE);
    expect(row.submissionStatus).toBe('accepted');
    expect(row.taskStatus).toBeNull();
  });

  it('describes a file nothing points at rather than dropping it', () => {
    const [row] = index();

    expect(row.source).toBe('unattached');
    expect(row.participantId).toBeNull();
    expect(row.submissionId).toBeNull();
    expect(row.taskStatus).toBeNull();
  });
});
