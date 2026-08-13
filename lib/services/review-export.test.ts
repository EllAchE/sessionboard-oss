import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  participantRole,
  reviewAssignment,
  score,
  scorecardCriterion,
  submission,
} from '../../db/schema';
import type { EventContext } from '../context';
import { isAppError, type AppError } from '../errors';
import { parseCsvRows } from '../csv';
import {
  buildReviewResultsExport,
  reviewResultsCsv,
  type CriterionSpec,
  type ReviewResultsExportSubmission,
} from './review';

type StoredRow = Record<string, unknown>;
type Projection = Record<string, unknown> | undefined;

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('../../db/client', () => ({ getDb: () => state.db }));

function parameters(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(parameters);
  if (!value || typeof value !== 'object') return [];
  const candidate = value as { value?: unknown; queryChunks?: unknown[] };
  if (value.constructor.name === 'Param') {
    return Array.isArray(candidate.value)
      ? candidate.value.filter((entry): entry is string => typeof entry === 'string')
      : typeof candidate.value === 'string'
        ? [candidate.value]
        : [];
  }
  return candidate.queryChunks?.flatMap(parameters) ?? [];
}

function projected(row: StoredRow, projection?: Projection): StoredRow {
  return projection
    ? Object.fromEntries(Object.keys(projection).map((key) => [key, row[key]]))
    : row;
}

function fakeDb(input: {
  round: StoredRow | null;
  rows?: Map<unknown, StoredRow[]>;
  onSelect?: () => void;
}) {
  const rows: Map<unknown, StoredRow[]> = input.rows ?? new Map();
  const select = (projection?: Projection) => {
    let table: unknown = null;
    let filters: string[] = [];
    const builder = {
      from(next: unknown) {
        table = next;
        return builder;
      },
      innerJoin: () => builder,
      where(condition: unknown) {
        filters = parameters(condition);
        return builder;
      },
      orderBy: () => builder,
      then: (onOk: (value: StoredRow[]) => unknown, onErr?: (reason: unknown) => unknown) => {
        input.onSelect?.();
        const selected = (rows.get(table) ?? []).filter((row) => {
          if (table === scorecardCriterion) return filters.includes(String(row.reviewRoundId));
          if (table === submission) return filters.includes(String(row.eventId));
          if (table === reviewAssignment) {
            return (
              filters.includes(String(row.reviewRoundId)) &&
              filters.includes(String(row.submissionId))
            );
          }
          if (table === participantRole) {
            return (
              filters.includes(String(row.submissionId)) && filters.includes(String(row.eventId))
            );
          }
          if (table === score) return filters.includes(String(row.assignmentId));
          return true;
        });
        return Promise.resolve(selected.map((row) => projected(row, projection))).then(onOk, onErr);
      },
    };
    return builder;
  };

  return {
    select,
    query: {
      reviewRound: {
        findFirst: async (options: { where?: unknown }) => {
          const round = input.round;
          const filters = parameters(options.where);
          return round &&
            filters.includes(String(round.id)) &&
            filters.includes(String(round.eventId))
            ? round
            : null;
        },
      },
    },
  };
}

const context = (roles: EventContext['roles'] = ['organizer']): EventContext => ({
  actor: {
    userId: 'organizer-1',
    email: 'chair@example.test',
    name: 'Chair',
    impersonatedByUserId: null,
  },
  eventId: 'event-1',
  roles,
});

async function rejection(work: Promise<unknown>): Promise<AppError> {
  try {
    await work;
  } catch (error) {
    if (isAppError(error)) return error;
    throw error;
  }
  throw new Error('expected the call to be refused');
}

const CRITERIA: CriterionSpec[] = [
  {
    id: 'relevance',
    label: 'Relevance, fit',
    description: null,
    weight: 2,
    maxScore: 5,
    position: 0,
  },
  {
    id: 'recommendation',
    label: 'Recommendation',
    description: null,
    weight: 1,
    maxScore: 3,
    position: 1,
  },
];

const SUBMISSIONS: ReviewResultsExportSubmission[] = [
  {
    ref: 2,
    title: 'Unscored proposal',
    status: 'submitted',
    speakers: [{ name: 'No Score', email: 'none@example.test', kind: 'speaker' }],
    reviewers: [],
  },
  {
    ref: 1,
    title: 'Scaling "CI", safely',
    status: 'under_review',
    speakers: [
      { name: 'Priya Raman', email: 'priya@example.test', kind: 'speaker' },
      { name: 'Marcus "M"', email: 'marcus@example.test', kind: 'co_speaker' },
    ],
    reviewers: [
      {
        assignmentId: 'assignment-sam',
        reviewerUserId: 'sam',
        reviewerName: 'Sam Reviewer',
        reviewerEmail: 'sam@example.test',
        status: 'completed',
        comment: 'Strong, but\nverify',
        completedAt: new Date('2026-08-13T01:02:03.000Z'),
        scores: [
          { criterionId: 'relevance', value: 2 },
          { criterionId: 'recommendation', value: 3 },
        ],
      },
      {
        assignmentId: 'assignment-alex',
        reviewerUserId: 'alex',
        reviewerName: 'Alex Reviewer',
        reviewerEmail: 'alex@example.test',
        status: 'pending',
        comment: null,
        completedAt: null,
        scores: [{ criterionId: 'relevance', value: 5 }],
      },
    ],
  },
];

describe('reviewResultsCsv', () => {
  it('writes exact dynamic headers and rows for multi-reviewer and unscored submissions', () => {
    const csv = reviewResultsCsv({ name: 'Initial Review' }, CRITERIA, SUBMISSIONS);

    expect(parseCsvRows(csv)).toEqual([
      [
        'Submission ref',
        'Title',
        'Submission status',
        'Round',
        'Aggregate score (1-5)',
        'Reviews completed',
        'Reviews assigned',
        'Speakers',
        'Co-speakers',
        'Reviewer',
        'Reviewer email',
        'Review status',
        'Reviewer score (1-5)',
        'Relevance, fit (max 5; weight 2)',
        'Recommendation (max 3; weight 1)',
        'Reviewer comment',
        'Review completed at',
      ],
      [
        'ABS-1',
        'Scaling "CI", safely',
        'under_review',
        'Initial Review',
        '4.00',
        '1',
        '2',
        'Priya Raman <priya@example.test>',
        'Marcus "M" <marcus@example.test>',
        'Alex Reviewer',
        'alex@example.test',
        'pending',
        '5.00',
        '5',
        '',
        '',
        '',
      ],
      [
        'ABS-1',
        'Scaling "CI", safely',
        'under_review',
        'Initial Review',
        '4.00',
        '1',
        '2',
        'Priya Raman <priya@example.test>',
        'Marcus "M" <marcus@example.test>',
        'Sam Reviewer',
        'sam@example.test',
        'completed',
        '3.00',
        '2',
        '3',
        'Strong, but\nverify',
        '2026-08-13T01:02:03.000Z',
      ],
      [
        'ABS-2',
        'Unscored proposal',
        'submitted',
        'Initial Review',
        '',
        '0',
        '0',
        'No Score <none@example.test>',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ],
    ]);
    expect(csv).toContain('"Scaling ""CI"", safely"');
    expect(csv).toContain('"Strong, but\nverify"');
  });
});

describe('buildReviewResultsExport', () => {
  let selectCount = 0;

  beforeEach(() => {
    selectCount = 0;
  });

  it('is limited to organizers', async () => {
    state.db = fakeDb({ round: null, onSelect: () => (selectCount += 1) });
    const error = await rejection(buildReviewResultsExport(context(['reviewer']), 'round-1'));
    expect(error.code).toBe('forbidden');
    expect(selectCount).toBe(0);
  });

  it('rejects a round owned by another event before reading export rows', async () => {
    state.db = fakeDb({
      round: {
        id: 'round-other',
        eventId: 'event-2',
        name: 'Other event review',
        position: 0,
        status: 'open',
        blindUntilClose: false,
        anonymized: false,
        opensAt: null,
        closesAt: null,
        createdAt: new Date(),
      },
      onSelect: () => (selectCount += 1),
    });
    const error = await rejection(buildReviewResultsExport(context(), 'round-other'));
    expect(error.code).toBe('not_found');
    expect(selectCount).toBe(0);
  });

  it('includes only submissions and people in the active event and assignments in the selected round', async () => {
    const rows = new Map<unknown, StoredRow[]>([
      [scorecardCriterion, CRITERIA.map((row) => ({ ...row, reviewRoundId: 'round-1' }))],
      [
        submission,
        [
          { id: 'submission-1', ref: 1, title: 'In event', status: 'submitted', eventId: 'event-1' },
          { id: 'submission-2', ref: 2, title: 'Other event', status: 'submitted', eventId: 'event-2' },
        ],
      ],
      [
        reviewAssignment,
        [
          {
            id: 'assignment-1',
            submissionId: 'submission-1',
            reviewRoundId: 'round-1',
            reviewerUserId: 'reviewer-1',
            reviewerName: 'Reviewer One',
            reviewerEmail: 'reviewer@example.test',
            status: 'completed',
            comment: null,
            completedAt: null,
          },
          {
            id: 'assignment-other-round',
            submissionId: 'submission-1',
            reviewRoundId: 'round-2',
            reviewerUserId: 'reviewer-2',
            reviewerName: 'Wrong Round',
            reviewerEmail: 'wrong@example.test',
            status: 'completed',
            comment: null,
            completedAt: null,
          },
        ],
      ],
      [
        participantRole,
        [
          {
            submissionId: 'submission-1',
            eventId: 'event-1',
            displayName: 'Event Speaker',
            accountName: 'Event Speaker',
            email: 'speaker@example.test',
            kind: 'speaker',
            isPrimary: true,
            position: 0,
          },
          {
            submissionId: 'submission-1',
            eventId: 'event-2',
            displayName: 'Cross-event Person',
            accountName: 'Cross-event Person',
            email: 'cross@example.test',
            kind: 'co_speaker',
            isPrimary: false,
            position: 1,
          },
        ],
      ],
      [
        score,
        [
          { assignmentId: 'assignment-1', criterionId: 'relevance', value: 4 },
          { assignmentId: 'assignment-other-round', criterionId: 'relevance', value: 1 },
        ],
      ],
    ]);
    state.db = fakeDb({
      round: {
        id: 'round-1',
        eventId: 'event-1',
        name: 'Selected',
        position: 0,
        status: 'open',
        blindUntilClose: false,
        anonymized: false,
        opensAt: null,
        closesAt: null,
        createdAt: new Date(),
      },
      rows,
    });

    const result = await buildReviewResultsExport(context(), 'round-1');
    const csv = parseCsvRows(result.csv).map((row) => row.join(' | ')).join('\n');
    expect(csv).toContain('ABS-1');
    expect(csv).toContain('Reviewer One');
    expect(csv).toContain('Event Speaker');
    expect(csv).not.toContain('Other event');
    expect(csv).not.toContain('Wrong Round');
    expect(csv).not.toContain('Cross-event Person');
    expect(result.filename).toBe('review-results-selected.csv');
  });
});
