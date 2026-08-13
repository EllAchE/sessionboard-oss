import { describe, expect, it } from 'vitest';
import { FakeAccelEventsProgramGateway } from './fake-program';
import { planProgramSync, reconcileProgram } from './program';
import type { ProgramRecord } from './program-types';

const DESIRED: ProgramRecord[] = [
  {
    resourceType: 'event',
    sourceId: 'first-settlement',
    data: { name: 'The First Settlement', timezone: 'Europe/Rome' },
  },
  {
    resourceType: 'session',
    sourceId: 'return-the-republic',
    data: { title: 'On Returning the Republic', status: 'published' },
  },
  {
    resourceType: 'session',
    sourceId: 'provincial-command',
    data: { title: 'A Ten-Year Provincial Command', status: 'published' },
  },
  {
    resourceType: 'session',
    sourceId: 'name-augustus',
    data: { title: 'A Name Equal to the Settlement', status: 'published' },
  },
  {
    resourceType: 'speaker',
    sourceId: 'octavian',
    data: { firstName: 'Gaius', lastName: 'Octavius' },
  },
  {
    resourceType: 'speaker',
    sourceId: 'agrippa',
    data: { firstName: 'Marcus', lastName: 'Agrippa' },
  },
];

describe('fixture Accelevents program reconciliation', () => {
  it('plans creates, updates, deletes and no-ops by stable Cicero source id', async () => {
    const gateway = new FakeAccelEventsProgramGateway({
      eventUrl: 'first-settlement',
    });
    gateway.resetToDriftedFixture(DESIRED);

    const plan = planProgramSync(DESIRED, await gateway.listRecords());

    expect(new Set(plan.map((item) => item.action))).toEqual(
      new Set(['create', 'update', 'delete', 'noop']),
    );
    expect(plan.find((item) => item.action === 'delete')).toMatchObject({
      resourceType: 'session',
      sourceId: 'retired-motion',
    });
  });

  it('previews without changing the remote collection', async () => {
    const gateway = new FakeAccelEventsProgramGateway({
      eventUrl: 'first-settlement',
    });
    gateway.resetToDriftedFixture(DESIRED);
    const before = await gateway.listRecords();

    const summary = await reconcileProgram(gateway, DESIRED, {
      mode: 'preview',
      allowDeletes: false,
    });

    expect(summary.counts).toEqual({
      create: 1,
      update: 3,
      delete: 1,
      noop: 2,
      blockedDeletes: 0,
    });
    expect(summary.results.every((item) => item.status === 'planned')).toBe(true);
    expect(await gateway.listRecords()).toEqual(before);
  });

  it('applies non-destructive changes while blocking a delete that was not authorized', async () => {
    const gateway = new FakeAccelEventsProgramGateway({
      eventUrl: 'first-settlement',
    });
    gateway.resetToDriftedFixture(DESIRED);

    const summary = await reconcileProgram(gateway, DESIRED, {
      mode: 'apply',
      allowDeletes: false,
    });

    expect(summary.counts.blockedDeletes).toBe(1);
    expect(summary.results.find((item) => item.action === 'delete')?.status).toBe('blocked');
    expect((await gateway.listRecords()).some((item) => item.sourceId === 'retired-motion')).toBe(
      true,
    );
  });

  it('applies authorized deletes and becomes idempotent on the next run', async () => {
    const gateway = new FakeAccelEventsProgramGateway({
      eventUrl: 'first-settlement',
    });
    gateway.resetToDriftedFixture(DESIRED);

    const applied = await reconcileProgram(gateway, DESIRED, {
      mode: 'apply',
      allowDeletes: true,
    });
    const repeated = await reconcileProgram(gateway, DESIRED, {
      mode: 'apply',
      allowDeletes: true,
    });

    expect(applied.results.filter((item) => item.status === 'applied')).not.toHaveLength(0);
    expect(repeated.counts).toMatchObject({
      create: 0,
      update: 0,
      delete: 0,
      noop: DESIRED.length,
      blockedDeletes: 0,
    });
    expect(repeated.results.every((item) => item.action === 'noop')).toBe(true);
    expect(repeated.results.every((item) => item.status === 'unchanged')).toBe(true);
  });
});
