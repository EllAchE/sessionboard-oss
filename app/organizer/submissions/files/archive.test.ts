import { describe, expect, it } from 'vitest';
import {
  ARCHIVE_MAX_BYTES,
  ARCHIVE_MAX_FILES,
  archiveFilename,
  archiveFolder,
  checkArchiveBudget,
  planArchive,
} from './archive';

const subject = (over: Partial<Parameters<typeof archiveFolder>[0]> = {}) => ({
  fileId: 'f1',
  filename: 'slides.pdf',
  submissionRef: null,
  ownerName: null,
  ...over,
});

describe('archiveFolder', () => {
  it('prefers the submission ref', () => {
    expect(archiveFolder(subject({ submissionRef: 'ABS-4', ownerName: 'Ada' }))).toBe('ABS-4');
  });

  it('falls back to the owner, then to a bucket', () => {
    expect(archiveFolder(subject({ ownerName: 'Ada Lovelace' }))).toBe('Ada Lovelace');
    expect(archiveFolder(subject())).toBe('unfiled');
  });
});

describe('planArchive', () => {
  it('groups by folder and keeps duplicate filenames apart', () => {
    const plan = planArchive([
      subject({ fileId: 'a', submissionRef: 'ABS-1' }),
      subject({ fileId: 'b', submissionRef: 'ABS-2' }),
      subject({ fileId: 'c', submissionRef: 'ABS-1' }),
    ]);
    expect(plan.map((entry) => entry.name)).toEqual([
      'ABS-1/slides.pdf',
      'ABS-2/slides.pdf',
      'ABS-1/slides (2).pdf',
    ]);
  });
});

describe('checkArchiveBudget', () => {
  it('accepts an ordinary selection', () => {
    expect(checkArchiveBudget(12, 40 * 1024 * 1024)).toBeNull();
  });

  it('refuses an empty selection, too many files and too many bytes', () => {
    expect(checkArchiveBudget(0, 0)?.message).toContain('at least one');
    expect(checkArchiveBudget(ARCHIVE_MAX_FILES + 1, 1)?.message).toContain('batches');
    expect(checkArchiveBudget(1, ARCHIVE_MAX_BYTES + 1)?.message).toContain('1 GB');
  });
});

describe('archiveFilename', () => {
  it('is dated so two downloads do not collide in a download folder', () => {
    expect(archiveFilename(new Date('2026-08-12T10:00:00Z'))).toBe('cicero-files-2026-08-12.zip');
  });
});
