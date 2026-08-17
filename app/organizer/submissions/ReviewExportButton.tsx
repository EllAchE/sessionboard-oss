'use client';

import { useState, useTransition } from 'react';
import { Download } from 'lucide-react';
import { Button, useToast } from '../../../components/ui';
import { downloadReviewResults, type ReviewExportOutcome } from './export/download';
import styles from './ReviewExportButton.module.css';

/**
 * `ABS-13`. The export control, and the answer to what it did.
 *
 * This is deliberately a button rather than the `<a href>` the repo's own convention would prefer
 * ("navigation that looks like an action still has to be a link"). The convention holds for
 * navigation; this is not navigation. A link hands the request to the browser, which means a 403
 * from `submission:decide` or a 400 for a missing round lands as either a silent no-op or a raw
 * JSON page, and a success is indistinguishable from a click that never registered. Holding the
 * response is the only way this surface can name the file it produced or say that it failed.
 */
export function ReviewExportButton({ roundId }: { roundId: string }) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<ReviewExportOutcome | null>(null);

  const run = () => {
    setOutcome(null);
    startTransition(async () => {
      const result = await downloadReviewResults(roundId);
      setOutcome(result);
      if (result.ok) {
        toast({
          title: 'Review results exported',
          description: `Downloaded ${result.filename}`,
          tone: 'success',
        });
      } else {
        toast({ title: 'Export failed', description: result.message, tone: 'danger' });
      }
    });
  };

  return (
    <span className={styles.wrap}>
      <Button
        variant="ghost"
        iconLeft={<Download size={14} />}
        onClick={run}
        loading={pending}
        aria-label="Export review results as CSV"
      >
        Export CSV
      </Button>
      {/*
        `role="status"` rather than a bare span: the download itself is invisible to a screen reader,
        so the filename is the only announcement that the action completed.
      */}
      <span className={styles.status} role="status" aria-live="polite">
        {outcome?.ok ? (
          <span className={styles.ok}>
            Downloaded <span className={styles.filename}>{outcome.filename}</span>
          </span>
        ) : outcome ? (
          <span className={styles.error}>{outcome.message}</span>
        ) : null}
      </span>
    </span>
  );
}
