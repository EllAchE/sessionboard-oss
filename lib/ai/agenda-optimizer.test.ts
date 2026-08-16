import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AGENDA_OPTIMIZATION_WEIGHTS,
  optimizeAgenda,
  parseAgendaOptimizationWeights,
  type AgendaItemSignals,
  type AgendaOptimizationContext,
} from './agenda-optimizer';
import type { QueueItem, ScheduleEntry } from '@/lib/services/schedule';

function queueItem(id: string, title: string): QueueItem {
  return {
    kind: 'submission',
    id,
    ref: id,
    title,
    descriptionMarkdown: null,
    trackId: null,
    formatId: null,
    durationMinutes: 45,
    speakers: [],
  };
}

function signals(title: string, overrides: Partial<AgendaItemSignals> = {}): AgendaItemSignals {
  return {
    title,
    descriptionMarkdown: null,
    trackName: null,
    tags: [],
    personaName: null,
    level: null,
    formatName: 'Talk',
    expectedAttendance: null,
    speakerPopularity: [],
    ...overrides,
  };
}

function context(
  queue: QueueItem[],
  signalRows: Record<string, AgendaItemSignals>,
  overrides: Partial<AgendaOptimizationContext> = {},
): AgendaOptimizationContext {
  return {
    timezone: 'UTC',
    dayKeys: ['2026-09-08'],
    dayStartMinute: 9 * 60,
    dayEndMinute: 17 * 60,
    rooms: [
      { id: 'main', name: 'Main stage', capacity: 500, floor: '1' },
      { id: 'studio', name: 'Studio', capacity: 100, floor: '1' },
    ],
    entries: [],
    queue,
    signalsByItemId: signalRows,
    weights: DEFAULT_AGENDA_OPTIMIZATION_WEIGHTS,
    ...overrides,
  };
}

function scheduledEntry(overrides: Partial<ScheduleEntry> = {}): ScheduleEntry {
  return {
    id: 'existing',
    ref: 1,
    title: 'Energy systems and software',
    submissionId: null,
    roomId: 'main',
    trackId: null,
    formatId: null,
    startsAt: new Date('2026-09-08T09:00:00.000Z'),
    endsAt: new Date('2026-09-08T09:45:00.000Z'),
    status: 'draft',
    ceuCredits: null,
    clientId: null,
    speakers: [],
    ...overrides,
  };
}

describe('agenda optimizer', () => {
  it('separates talks whose likely audiences overlap while still using parallel rooms', () => {
    const queue = [
      queueItem('energy', 'Energy systems and software'),
      queueItem('bioweapons', 'Bioweapons and software'),
      queueItem('gardening', 'Community gardening'),
    ];
    const planned = optimizeAgenda(
      context(queue, {
        energy: signals(queue[0].title),
        bioweapons: signals(queue[1].title),
        gardening: signals(queue[2].title),
      }),
    );
    const byId = new Map(planned.map((placement) => [placement.id, placement]));

    expect(byId.get('energy')?.startMinute).not.toBe(byId.get('bioweapons')?.startMinute);
    expect(byId.get('gardening')?.startMinute).toBe(9 * 60);
    expect(
      planned
        .filter((placement) => placement.id === 'energy' || placement.id === 'bioweapons')
        .map((placement) => placement.rationale)
        .join(' '),
    ).toContain('topics software');
  });

  it('puts high-demand speakers on larger stages and niche talks in smaller rooms', () => {
    const queue = [
      queueItem('keynote', 'The future of software'),
      queueItem('clinic', 'Small-team deployment clinic'),
    ];
    const planned = optimizeAgenda(
      context(
        queue,
        {
          keynote: signals(queue[0].title, {
            expectedAttendance: 400,
            speakerPopularity: [100],
          }),
          clinic: signals(queue[1].title, {
            expectedAttendance: 50,
            speakerPopularity: [10],
          }),
        },
        { dayEndMinute: 9 * 60 + 45 },
      ),
    );
    const byId = new Map(planned.map((placement) => [placement.id, placement]));

    expect(byId.get('keynote')?.roomId).toBe('main');
    expect(byId.get('clinic')?.roomId).toBe('studio');
    expect(byId.get('keynote')?.rationale).toContain('speaker popularity 100/100');
  });

  it('lets organizers turn audience separation off without weakening hard conflicts', () => {
    const queue = [
      queueItem('energy', 'Energy systems and software'),
      queueItem('bioweapons', 'Bioweapons and software'),
    ];
    const signalRows = {
      energy: signals(queue[0].title),
      bioweapons: signals(queue[1].title),
    };
    const separated = optimizeAgenda(context(queue, signalRows));
    const compact = optimizeAgenda(
      context(queue, signalRows, {
        weights: { ...DEFAULT_AGENDA_OPTIMIZATION_WEIGHTS, audienceOverlap: 0 },
      }),
    );

    expect(separated[0].startMinute).not.toBe(separated[1].startMinute);
    expect(compact[0].startMinute).toBe(compact[1].startMinute);

    const sameSpeaker = queue.map((item) => ({
      ...item,
      speakers: [{ participantId: 'speaker-1', name: 'Ada' }],
    }));
    const conflictFree = optimizeAgenda(
      context(sameSpeaker, signalRows, {
        weights: { ...DEFAULT_AGENDA_OPTIMIZATION_WEIGHTS, audienceOverlap: 0 },
      }),
    );
    expect(conflictFree[0].startMinute).not.toBe(conflictFree[1].startMinute);
  });

  it('keeps adjacent related talks on the same floor when room fit is equal', () => {
    const next = queueItem('next', 'Bioweapons and software');
    const planned = optimizeAgenda(
      context(
        [next],
        {
          existing: signals('Energy systems and software'),
          next: signals(next.title),
        },
        {
          entries: [scheduledEntry()],
          rooms: [
            { id: 'main', name: 'Main stage', capacity: 200, floor: '1' },
            { id: 'upper', name: 'Upper stage', capacity: 200, floor: '2' },
          ],
        },
      ),
    );

    expect(planned[0]).toMatchObject({
      startMinute: 9 * 60 + 45,
      roomId: 'main',
    });
  });

  it('is deterministic and bounds persisted weights', () => {
    const queue = [queueItem('one', 'One'), queueItem('two', 'Two')];
    const input = context(queue, {
      one: signals('One'),
      two: signals('Two'),
    });

    expect(optimizeAgenda(input)).toEqual(optimizeAgenda(input));
    expect(parseAgendaOptimizationWeights({ audienceOverlap: 400, roomFit: -10 })).toMatchObject({
      audienceOverlap: 100,
      roomFit: 0,
      speakerPopularity: DEFAULT_AGENDA_OPTIMIZATION_WEIGHTS.speakerPopularity,
    });
  });
});
