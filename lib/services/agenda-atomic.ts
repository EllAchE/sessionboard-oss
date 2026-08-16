import { conflict } from '../errors';
import {
  blockingConflicts,
  detectConflicts,
  type Conflict,
  type ConflictPolicy,
  type ScheduleEntry,
} from './schedule';

export type AgendaMutation<T> = {
  data: T;
  changedSessionIds: string[];
};

export type AtomicAgendaDependencies<T, Transaction> = {
  transaction: (work: (transaction: Transaction) => Promise<T>) => Promise<T>;
  lock: (transaction: Transaction) => Promise<void>;
  loadEntries: (transaction: Transaction) => Promise<ScheduleEntry[]>;
  /**
   * `AR-35`. Read inside the same transaction and behind the same advisory lock as the entries, so
   * an organizer flipping the event to `block` cannot be raced by a write that read `warn`.
   * Omitted means the product default, which is `warn`.
   */
  loadPolicy?: (transaction: Transaction) => Promise<ConflictPolicy>;
  /**
   * Called with the clashes the mutation is about to commit under a `warn` policy. The write is not
   * refused, but it is not silent either — the caller records them so the organizer is told what
   * they just created rather than discovering it on the printed programme.
   */
  onWarn?: (conflicts: Conflict[], transaction: Transaction) => void | Promise<void>;
};

/**
 * Re-detects after the mutation, inside the lock, and decides what to do with whatever it finds.
 *
 * The set is narrowed to clashes touching a session this mutation changed: an agenda that was
 * already broken when the organizer opened it must not make every unrelated edit fail. What happens
 * next is the event's `ConflictPolicy` — `block` throws and rolls the transaction back, `warn`
 * commits and hands the clashes to `onWarn` to surface.
 */
export async function runAtomicAgendaMutation<T, Transaction>(
  dependencies: AtomicAgendaDependencies<T, Transaction>,
  mutate: (transaction: Transaction) => Promise<AgendaMutation<T>>,
): Promise<T> {
  return dependencies.transaction(async (transaction) => {
    await dependencies.lock(transaction);
    const result = await mutate(transaction);
    const changed = new Set(result.changedSessionIds);
    const touching = detectConflicts(await dependencies.loadEntries(transaction)).filter((item) =>
      item.sessionIds.some((sessionId) => changed.has(sessionId)),
    );
    if (touching.length === 0) return result.data;

    const policy = (await dependencies.loadPolicy?.(transaction)) ?? 'warn';
    const blocked = blockingConflicts(touching, policy);
    if (blocked.length > 0) throw conflict(blocked[0].message);

    await dependencies.onWarn?.(touching, transaction);
    return result.data;
  });
}
