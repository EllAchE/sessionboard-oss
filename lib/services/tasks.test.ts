import { describe, expect, it } from 'vitest';
import { assertCompletable, reconcileStatus } from './tasks';

/**
 * `listPortalTasks` feeds both `/portal/[eventSlug]/tasks` and `/portal/[eventSlug]/files` — they
 * cannot show two different answers for the same assignment as long as `reconcileStatus` is the only
 * thing standing between the stored `status` column and what either screen renders. The case that
 * matters here is a row `assertCompletable` would never have allowed to be written in the first
 * place (seed data, a hand edit, a migration) landing as `completed` with no file or answer behind
 * it.
 */
describe('reconcileStatus', () => {
  it('downgrades a file_upload task marked completed with no file to in_progress', () => {
    expect(reconcileStatus('file_upload', 'completed', false)).toBe('in_progress');
  });

  it('keeps a file_upload task completed when a file is actually attached', () => {
    expect(reconcileStatus('file_upload', 'completed', true)).toBe('completed');
  });

  it('downgrades a form task marked completed with no answers to in_progress', () => {
    expect(reconcileStatus('form', 'completed', false)).toBe('in_progress');
  });

  it('keeps a form task completed when answers are actually present', () => {
    expect(reconcileStatus('form', 'completed', true)).toBe('completed');
  });

  it('leaves acknowledge and link tasks alone — the status flag is their only evidence', () => {
    expect(reconcileStatus('acknowledge', 'completed', false)).toBe('completed');
    expect(reconcileStatus('link', 'completed', false)).toBe('completed');
  });

  it('leaves non-completed statuses untouched regardless of evidence', () => {
    expect(reconcileStatus('file_upload', 'in_progress', false)).toBe('in_progress');
    expect(reconcileStatus('file_upload', 'not_started', false)).toBe('not_started');
    expect(reconcileStatus('form', 'waived', false)).toBe('waived');
  });
});

/**
 * The write-path guard this whole fix leans on: if `assertCompletable` is ever loosened, the
 * inconsistency `reconcileStatus` exists to paper over can be produced through the app itself, not
 * just through data that bypassed it.
 */
describe('assertCompletable', () => {
  it('refuses to complete a file_upload task with no files', () => {
    expect(() =>
      assertCompletable({ kind: 'file_upload', fileCount: 0, answers: null, acknowledged: false }),
    ).toThrow();
  });

  it('refuses to complete a form task with no answers', () => {
    expect(() =>
      assertCompletable({ kind: 'form', fileCount: 0, answers: null, acknowledged: false }),
    ).toThrow();
  });

  it('allows a file_upload task with at least one file', () => {
    expect(() =>
      assertCompletable({ kind: 'file_upload', fileCount: 1, answers: null, acknowledged: false }),
    ).not.toThrow();
  });
});
