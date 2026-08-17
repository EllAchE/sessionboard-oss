import { Download, Eye } from 'lucide-react';
import { Badge, Card, CardBody, CardHeader, CardTitle } from '@/components/ui';
import { formatBytes } from '@/lib/services/file-format';
import type { EventFileRow } from '@/lib/services/files';
import styles from './speakers.module.css';

/**
 * `SPK-10`. What this speaker has actually uploaded, on their own record. The page used to say
 * "Photo on file" and offer to replace it, which answers neither of the two questions an organizer
 * opens a speaker record to ask — *what* did they send, and *when* — and offered no way to look at
 * it. Every row here carries the filename, who uploaded it, the timestamp, and a control that
 * returns the bytes.
 *
 * Uploader is worth its own line rather than being assumed from the owner: a headshot the organizer
 * pasted in on the speaker's behalf and one the speaker uploaded through their portal are the same
 * row on the roster and very different facts when chasing a missing deliverable.
 */

export type SpeakerFileRow = {
  id: string;
  filename: string;
  sizeBytes: number;
  version: number;
  versionCount: number;
  source: EventFileRow['source'];
  taskName: string | null;
  submissionRef: string | null;
  submissionTitle: string | null;
  uploaderName: string | null;
  uploadedAt: string;
};

const SOURCE_LABEL: Record<SpeakerFileRow['source'], string> = {
  submission: 'Submission answer',
  task: 'Speaker task',
  headshot: 'Headshot',
  unattached: 'Unattached',
};

export function toSpeakerFileRow(row: EventFileRow): SpeakerFileRow {
  return {
    id: row.id,
    filename: row.filename,
    sizeBytes: row.sizeBytes,
    version: row.version,
    versionCount: row.versionCount,
    source: row.source,
    taskName: row.taskName,
    submissionRef: row.submissionRef,
    submissionTitle: row.submissionTitle,
    uploaderName: row.uploaderName ?? row.uploaderEmail,
    // Pinned to UTC and printed in full: "3 days ago" is not what a deadline conversation needs.
    uploadedAt: `${row.createdAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
  };
}

function context(row: SpeakerFileRow): string {
  const source = SOURCE_LABEL[row.source];
  const named = row.source === 'task' && row.taskName ? `${source} · ${row.taskName}` : source;
  const session = row.submissionRef ? ` · ${row.submissionRef} ${row.submissionTitle ?? ''}`.trimEnd() : '';
  return `${named}${session}`;
}

export function SpeakerFiles({ files }: { files: SpeakerFileRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Files</CardTitle>
      </CardHeader>
      <CardBody>
        {files.length === 0 ? (
          <p className={styles.muted}>This speaker has not uploaded anything yet.</p>
        ) : (
          <ul className={styles.fileList}>
            {files.map((file) => (
              <li key={file.id} className={styles.fileRow}>
                <div className={styles.fileMain}>
                  <span className={styles.fileName}>
                    {file.filename}
                    {file.versionCount > 1 ? (
                      <Badge tone="info">
                        v{file.version} of {file.versionCount}
                      </Badge>
                    ) : null}
                  </span>
                  <span className={styles.fileMeta}>
                    {context(file)} · {formatBytes(file.sizeBytes)}
                  </span>
                  <span className={styles.fileMeta}>
                    Uploaded by {file.uploaderName ?? 'someone no longer on this account'} ·{' '}
                    {file.uploadedAt}
                  </span>
                </div>
                <div className={styles.fileActions}>
                  <a
                    className={styles.fileAction}
                    href={`/organizer/speakers/file/${file.id}?inline`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Eye size={14} aria-hidden />
                    View
                  </a>
                  <a className={styles.fileAction} href={`/organizer/speakers/file/${file.id}`}>
                    <Download size={14} aria-hidden />
                    Download
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
