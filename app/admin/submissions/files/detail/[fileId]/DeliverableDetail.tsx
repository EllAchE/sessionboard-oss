'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Download } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Textarea,
  useToast,
} from '../../../../../../components/ui';
import { formatBytes } from '../../../../../../lib/services/file-format';
import { postFileCommentAction } from '../../actions';
import { FilesNav } from '../../FilesNav';
import queue from '../../../submissions.module.css';
import styles from '../../files.module.css';

export type VersionWire = {
  id: string;
  filename: string;
  version: number;
  sizeBytes: number;
  uploader: string;
  uploadedAt: string;
  isCurrent: boolean;
};

export type CommentWire = {
  id: string;
  authorName: string;
  version: number;
  when: string;
  bodyHtml: string;
};

/**
 * Feedback and versions sit on one screen because they are one conversation: the note asking for a
 * bigger font is the reason version 2 exists, and reading either alone loses the thread.
 */
export function DeliverableDetail({
  currentId,
  filename,
  versions,
  comments,
  ownerName,
  submissionId,
  submissionRef,
  submissionTitle,
}: {
  currentId: string;
  filename: string;
  versions: VersionWire[];
  comments: CommentWire[];
  ownerName: string | null;
  submissionId: string | null;
  submissionRef: string | null;
  submissionTitle: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [body, setBody] = useState('');
  const [pending, start] = useTransition();

  const newestFirst = [...versions].reverse();

  const post = () => {
    start(async () => {
      const result = await postFileCommentAction(currentId, body);
      if (!result.ok) {
        toast({ title: 'Not entered in the annals', description: result.message, tone: 'danger' });
        return;
      }
      setBody('');
      toast({
        title: 'Counsel dispatched',
        description: `${ownerName ?? 'The orator'} sees this in their atrium.`,
        tone: 'success',
      });
      router.refresh();
    });
  };

  return (
    <div className={queue.page}>
      <FilesNav />

      <header className={queue.header}>
        <div className={queue.headings}>
          <span className={queue.eyebrow}>Archived scroll</span>
          <h1 className={queue.title}>{filename}</h1>
          <p className={queue.subtitle}>
            {ownerName ?? 'Loose scroll'} ·{' '}
            {versions.length === 1 ? '1 version' : `${versions.length} versions`}
            {submissionId && submissionTitle ? (
              <>
                {' · '}
                <Link className={styles.fileLink} href={`/admin/submissions/${submissionId}`}>
                  <span className={styles.ref}>{submissionRef}</span> {submissionTitle}
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <div className={queue.actions}>
          <Button
            variant="ghost"
            iconLeft={<ChevronLeft size={14} />}
            onClick={() => router.push('/admin/submissions/files')}
          >
            Return to the archive
          </Button>
          <a href={`/admin/submissions/files/${currentId}`}>
            <Button variant="primary" iconLeft={<Download size={14} />}>
              Take the current scroll
            </Button>
          </a>
        </div>
      </header>

      <div className={styles.split}>
        <Card>
          <CardHeader>
            <CardTitle>Record through the ages</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className={styles.rowList}>
              {newestFirst.map((version) => (
                <li key={version.id} className={styles.versionRow} data-current={version.isCurrent}>
                  <span className={styles.versionNumber}>v{version.version}</span>
                  <span className={styles.versionMeta}>
                    <span className={styles.versionName}>{version.filename}</span>
                    <span className={styles.faint}>
                      {version.uploader} · {version.uploadedAt} · {formatBytes(version.sizeBytes)}
                    </span>
                  </span>
                  {version.isCurrent && <Badge tone="success">Current</Badge>}
                  <a
                    href={`/admin/submissions/files/${version.id}`}
                    aria-label={`Take version ${version.version}`}
                  >
                    <Download size={15} />
                  </a>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes from the council</CardTitle>
          </CardHeader>
          <CardBody>
            <div className={styles.stack}>
              {comments.length === 0 ? (
                <p className={queue.muted}>
                  No counsel has entered the annals. Anything written here appears beside this
                  scroll in the orator&apos;s atrium.
                </p>
              ) : (
                <ul className={styles.rowList}>
                  {comments.map((comment) => (
                    <li key={comment.id} className={styles.comment}>
                      <div className={styles.commentHead}>
                        <span className={styles.commentAuthor}>{comment.authorName}</span>
                        <span className={styles.faint}>
                          v{comment.version} · {comment.when}
                        </span>
                      </div>
                      <div
                        className={queue.prose}
                        /* Comment bodies pass through `renderMarkdown`, which sanitizes. */
                        dangerouslySetInnerHTML={{ __html: comment.bodyHtml }}
                      />
                    </li>
                  ))}
                </ul>
              )}

              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="deliverable-comment">
                  Leave counsel for the orator
                </label>
                <Textarea
                  id="deliverable-comment"
                  rows={4}
                  value={body}
                  placeholder="What must be revised before this enters the official archive?"
                  onChange={(event) => setBody(event.target.value)}
                />
              </div>
              <div className={styles.inlineRow}>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={pending || body.trim().length === 0}
                  onClick={post}
                >
                  {pending ? 'Inscribing…' : 'Enter counsel in the annals'}
                </Button>
                <span className={styles.faint}>The orator sees this in their atrium.</span>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
