'use client';

import { useActionState } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { Textarea } from '@/components/ui';
import { IDLE_STATE } from '../../form-state';
import styles from '../../portal.module.css';
import { postDeliverableCommentAction } from '../actions';
import { FormNotice, SubmitButton } from '../FormNotice';

export type CommentWire = {
  id: string;
  authorName: string;
  version: number;
  when: string;
  bodyHtml: string;
};

/**
 * `CNT-05`. One thread, two sides. The organizer writes here from the files screen and the speaker
 * answers from the portal, against the same file lineage — review feedback that lives in an email
 * thread is feedback nobody can find when the replacement deck arrives.
 */
export function CommentThread({
  eventSlug,
  fileId,
  comments,
  emptyLabel,
}: {
  eventSlug: string;
  fileId: string;
  comments: CommentWire[];
  emptyLabel: string;
}) {
  const [state, action] = useActionState(postDeliverableCommentAction, IDLE_STATE);

  return (
    <section className={styles.stackTight}>
      <h2 className={styles.sectionTitle}>
        <MessageSquare size={15} aria-hidden /> Review feedback
      </h2>

      {comments.length === 0 ? (
        <p className={styles.muted}>{emptyLabel}</p>
      ) : (
        <ol className={styles.commentList}>
          {comments.map((comment) => (
            <li key={comment.id} className={styles.comment}>
              <div className={styles.commentHead}>
                <span className={styles.commentAuthor}>{comment.authorName}</span>
                <span className={styles.faint}>
                  on version {comment.version} · {comment.when}
                </span>
              </div>
              <div
                className={styles.prose}
                /* Comment markdown, rendered by `renderMarkdown` in the service with HTML stripped. */
                dangerouslySetInnerHTML={{ __html: comment.bodyHtml }}
              />
            </li>
          ))}
        </ol>
      )}

      <form action={action} className={styles.stackTight}>
        <input type="hidden" name="eventSlug" value={eventSlug} />
        <input type="hidden" name="fileId" value={fileId} />
        <Textarea
          name="body"
          rows={3}
          placeholder="Reply to the organizers, or note what changed in this version"
          aria-label="Add a comment"
          required
        />
        <FormNotice state={state} />
        <div className={styles.taskActions}>
          <SubmitButton variant="primary" size="sm" iconLeft={<Send size={14} />}>
            Post comment
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}
