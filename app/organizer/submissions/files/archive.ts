/**
 * What goes in the archive and what it is called once it is there. Pure, so the table can enforce
 * the same ceilings before the POST that the route enforces after it — a refusal rendered next to
 * the button beats a JSON error page in a download tab.
 */

import { uniqueEntryName } from './zip';

/**
 * A budget, not a format limit: `ZIP_MAX_BYTES` is four times this. Every byte is read out of
 * object storage and back through the app, so an unbounded "select all" on a mature event is a
 * request that runs for minutes and dies to a platform timeout with nothing to show for it.
 */
export const ARCHIVE_MAX_BYTES = 1024 * 1024 * 1024;
export const ARCHIVE_MAX_FILES = 500;

export type ArchiveSubject = {
  fileId: string;
  filename: string;
  submissionRef: string | null;
  ownerName: string | null;
};

/**
 * Grouping by submission ref is what makes the extracted folder navigable; two speakers both
 * calling their deck `slides.pdf` is the normal case, not the edge case.
 */
export function archiveFolder(subject: ArchiveSubject): string {
  if (subject.submissionRef) return subject.submissionRef;
  if (subject.ownerName) return subject.ownerName;
  return 'unfiled';
}

export function planArchive(subjects: ArchiveSubject[]): Array<{ fileId: string; name: string }> {
  const taken = new Set<string>();
  return subjects.map((subject) => ({
    fileId: subject.fileId,
    name: uniqueEntryName(taken, `${archiveFolder(subject)}/${subject.filename}`),
  }));
}

export function archiveFilename(now = new Date()): string {
  return `cicero-files-${now.toISOString().slice(0, 10)}.zip`;
}

export type ArchiveRefusal = { message: string } | null;

export function checkArchiveBudget(count: number, totalBytes: number): ArchiveRefusal {
  if (count === 0) return { message: 'Select at least one file' };
  if (count > ARCHIVE_MAX_FILES) {
    return { message: `One archive holds up to ${ARCHIVE_MAX_FILES} files. Narrow the filters and download in batches.` };
  }
  if (totalBytes > ARCHIVE_MAX_BYTES) {
    const gigabytes = (totalBytes / ARCHIVE_MAX_BYTES).toFixed(1);
    return { message: `That selection is ${gigabytes} GB. One archive holds up to 1 GB, so download in batches.` };
  }
  return null;
}
