import { describe, expect, it } from 'vitest';
import type { ContentRevisionEntry } from './content';
import {
  buildOrganizerUpdateFeed,
  type OrganizerUpdateSources,
} from './updates';

const since = new Date('2026-08-01T00:00:00.000Z');

function emptySources(): OrganizerUpdateSources {
  return {
    submissions: [],
    reviews: [],
    participants: [],
    tasks: [],
    sessions: [],
    revisions: [],
    files: [],
    fileComments: [],
  };
}

function revision(overrides: Partial<ContentRevisionEntry> = {}): ContentRevisionEntry {
  return {
    id: 'revision-1',
    entityKind: 'participant',
    entityId: 'participant-1',
    entityLabel: 'Ada Lovelace',
    revisionNumber: 1,
    summary: 'Edited their speaker profile',
    editorUserId: 'ada-user',
    editorName: 'Ada Lovelace',
    createdAt: new Date('2026-08-10T10:00:00.000Z'),
    snapshot: {},
    changed: [],
    isCurrent: false,
    ...overrides,
  };
}

describe('organizer update feed', () => {
  it('turns one submission lifecycle into separately ordered received and decision updates', () => {
    const source = emptySources();
    source.submissions.push({
      id: 'submission-1',
      ref: 42,
      title: 'Machines That Think',
      status: 'accepted',
      submitterName: 'Ada Lovelace',
      submitterEmail: 'ada@example.com',
      submittedAt: new Date('2026-08-10T09:00:00.000Z'),
      decidedAt: new Date('2026-08-12T16:30:00.000Z'),
      updatedAt: new Date('2026-08-12T16:30:00.000Z'),
    });

    const feed = buildOrganizerUpdateFeed(source, since);

    expect(feed.map((item) => item.title)).toEqual([
      'Submission accepted: Machines That Think',
      'New submission: Machines That Think',
    ]);
    expect(feed[0]).toMatchObject({
      detail: 'ABS-42 is now accepted',
      href: '/organizer/submissions/submission-1',
      tone: 'success',
    });
    expect(feed[1].detail).toBe('ABS-42 from Ada Lovelace');
  });

  it('uses attributed content history instead of duplicating the same profile update', () => {
    const source = emptySources();
    source.participants.push({
      id: 'participant-1',
      displayName: 'Ada Lovelace',
      accountName: 'Augusta Ada King',
      accountEmail: 'ada@example.com',
      workflowStatus: 'confirmed',
      createdAt: new Date('2026-07-01T10:00:00.000Z'),
      updatedAt: new Date('2026-08-10T10:00:00.000Z'),
    });
    source.revisions.push(revision());

    const feed = buildOrganizerUpdateFeed(source, since);

    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({
      category: 'speakers',
      title: 'Speaker profile changed: Ada Lovelace',
      detail: 'Ada Lovelace · Edited their speaker profile',
      href: '/organizer/submissions/files/history',
    });
  });

  it('combines review, task, agenda, upload, and comment facts into one newest-first rundown', () => {
    const source = emptySources();
    source.reviews.push({
      id: 'review-1',
      submissionId: 'submission-1',
      submissionRef: 7,
      submissionTitle: 'The Analytical Engine',
      roundName: 'Programme committee',
      reviewerName: 'Charles Babbage',
      reviewerEmail: 'charles@example.com',
      completedAt: new Date('2026-08-11T09:00:00.000Z'),
    });
    source.tasks.push({
      id: 'task-1',
      taskName: 'Upload slides',
      participantName: 'Ada Lovelace',
      accountName: null,
      accountEmail: 'ada@example.com',
      status: 'completed',
      createdAt: new Date('2026-07-01T09:00:00.000Z'),
      updatedAt: new Date('2026-08-12T10:00:00.000Z'),
      completedAt: new Date('2026-08-12T10:00:00.000Z'),
    });
    source.sessions.push({
      id: 'session-1',
      title: 'The Analytical Engine',
      status: 'published',
      startsAt: new Date('2026-09-01T14:00:00.000Z'),
      roomName: 'Main hall',
      createdAt: new Date('2026-07-01T09:00:00.000Z'),
      updatedAt: new Date('2026-08-13T10:00:00.000Z'),
    });
    source.files.push({
      id: 'file-1',
      filename: 'analytical-engine.pdf',
      uploaderName: 'Ada Lovelace',
      uploaderEmail: 'ada@example.com',
      createdAt: new Date('2026-08-14T10:00:00.000Z'),
    });
    source.fileComments.push({
      id: 'comment-1',
      filename: 'analytical-engine.pdf',
      authorName: 'Program chair',
      createdAt: new Date('2026-08-15T10:00:00.000Z'),
    });

    const feed = buildOrganizerUpdateFeed(source, since);

    expect(feed.map((item) => item.category)).toEqual([
      'files',
      'files',
      'program',
      'tasks',
      'reviews',
    ]);
    expect(feed.map((item) => item.title)).toEqual([
      'New comment on analytical-engine.pdf',
      'File uploaded: analytical-engine.pdf',
      'Agenda updated: The Analytical Engine',
      'Task completed: Upload slides',
      'Review completed: The Analytical Engine',
    ]);
    expect(feed[2].detail).toBe('Published with a time slot in Main hall');
  });

  it('does not surface lifecycle facts outside the retained update window', () => {
    const source = emptySources();
    source.submissions.push({
      id: 'old-submission',
      ref: 1,
      title: 'Old news',
      status: 'submitted',
      submitterName: null,
      submitterEmail: 'old@example.com',
      submittedAt: new Date('2026-07-31T23:59:59.999Z'),
      decidedAt: null,
      updatedAt: new Date('2026-07-31T23:59:59.999Z'),
    });

    expect(buildOrganizerUpdateFeed(source, since)).toEqual([]);
  });

  it('timestamps a withdrawal at the withdrawal instead of rewriting an earlier decision', () => {
    const source = emptySources();
    source.submissions.push({
      id: 'withdrawn-submission',
      ref: 9,
      title: 'A Talk No Longer Given',
      status: 'withdrawn',
      submitterName: 'Ada Lovelace',
      submitterEmail: 'ada@example.com',
      submittedAt: new Date('2026-08-02T09:00:00.000Z'),
      decidedAt: new Date('2026-08-03T09:00:00.000Z'),
      updatedAt: new Date('2026-08-10T09:00:00.000Z'),
    });

    const feed = buildOrganizerUpdateFeed(source, since);

    expect(feed.map((item) => item.title)).toEqual([
      'Submission withdrawn: A Talk No Longer Given',
      'Submission decision recorded: A Talk No Longer Given',
      'New submission: A Talk No Longer Given',
    ]);
    expect(feed[0].occurredAt).toBe('2026-08-10T09:00:00.000Z');
    expect(feed[1].detail).toBe('ABS-9 was decided and is currently withdrawn');
  });
});
