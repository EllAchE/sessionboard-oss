import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAccountProfile, saveAccountProfile } from './account';

type AccountRow = {
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
};

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../../db/client', () => ({ getDb: () => state.db }));

function fakeDb(initial: AccountRow | null) {
  let row = initial;
  let updateCount = 0;
  const builder = {
    set(values: Partial<AccountRow>) {
      updateCount += 1;
      if (row) row = { ...row, ...values };
      return builder;
    },
    where() {
      return builder;
    },
    returning() {
      return Promise.resolve(row ? [row] : []);
    },
  };

  return {
    query: { user: { findFirst: async () => row } },
    update: () => builder,
    updates: () => updateCount,
  };
}

beforeEach(() => {
  state.db = null;
});

describe('account profile', () => {
  it('derives split fields for a legacy account without losing the stored display name', async () => {
    state.db = fakeDb({
      email: 'marcus@example.test',
      name: 'Marcus Tullius Cicero',
      firstName: null,
      lastName: null,
    });

    await expect(getAccountProfile('user-1')).resolves.toEqual({
      email: 'marcus@example.test',
      name: 'Marcus Tullius Cicero',
      firstName: 'Marcus Tullius',
      lastName: 'Cicero',
    });
  });

  it('normalizes both name fields and recomputes the display name on save', async () => {
    state.db = fakeDb({
      email: 'marcus@example.test',
      name: 'Marcus',
      firstName: 'Marcus',
      lastName: null,
    });

    await expect(
      saveAccountProfile('user-1', {
        firstName: '  Marcus Tullius  ',
        lastName: '  Cicero ',
      }),
    ).resolves.toEqual({
      email: 'marcus@example.test',
      name: 'Marcus Tullius Cicero',
      firstName: 'Marcus Tullius',
      lastName: 'Cicero',
    });
  });

  it('refuses to erase the account name', async () => {
    const db = fakeDb({
      email: 'marcus@example.test',
      name: 'Marcus',
      firstName: 'Marcus',
      lastName: null,
    });
    state.db = db;

    await expect(saveAccountProfile('user-1', { firstName: ' ', lastName: '' })).rejects.toThrow(
      'Add the name you want Cicero to use',
    );
    expect(db.updates()).toBe(0);
  });
});
