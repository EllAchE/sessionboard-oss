import { conflict } from '../errors';
import { detectConflicts, type ScheduleEntry } from './schedule';

export type AgendaMutation<T> = {
  data: T;
  changedSessionIds: string[];
};

export type AtomicAgendaDependencies<T, Transaction> = {
  transaction: (work: (transaction: Transaction) => Promise<T>) => Promise<T>;
  lock: (transaction: Transaction) => Promise<void>;
  loadEntries: (transaction: Transaction) => Promise<ScheduleEntry[]>;
};

export async function runAtomicAgendaMutation<T, Transaction>(
  dependencies: AtomicAgendaDependencies<T, Transaction>,
  mutate: (transaction: Transaction) => Promise<AgendaMutation<T>>,
): Promise<T> {
  return dependencies.transaction(async (transaction) => {
    await dependencies.lock(transaction);
    const result = await mutate(transaction);
    const changed = new Set(result.changedSessionIds);
    const blocked = detectConflicts(await dependencies.loadEntries(transaction)).filter((item) =>
      item.sessionIds.some((sessionId) => changed.has(sessionId)),
    );
    if (blocked.length > 0) throw conflict(blocked[0].message);
    return result.data;
  });
}
