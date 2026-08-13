import {
  listDeliverableStatus,
  summarizeDeliverables,
} from '../../../../../lib/services/content';
import { describeAcceptedTypes } from '../../../../../lib/services/file-format';
import { decideContext } from '../../context';
import { DeliverablesBoard, type DeliverableWire } from './DeliverablesBoard';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Required scrolls · Cicero' };

/**
 * `CNT-03`. The outstanding half is the point: a list of what arrived answers no question an
 * organizer chasing a deadline is actually asking.
 */
export default async function DeliverablesPage() {
  const ctx = await decideContext();
  const rows = await listDeliverableStatus(ctx);
  const summary = summarizeDeliverables(rows);

  const wire: DeliverableWire[] = rows.map((row) => ({
    assignmentId: row.assignmentId,
    speakerName: row.speakerName,
    speakerEmail: row.speakerEmail,
    taskName: row.taskName,
    required: row.required,
    state: row.state,
    overdue: row.overdue,
    dueAt: row.dueAt ? row.dueAt.toISOString() : null,
    submissionId: row.submissionId,
    submissionRef: row.submissionRef,
    submissionTitle: row.submissionTitle,
    accepts: row.request ? describeAcceptedTypes(row.request) : 'Any kind of record',
    maxSizeMb: row.request?.maxSizeMb ?? null,
    lastRemindedAt: row.lastRemindedAt ? row.lastRemindedAt.toISOString() : null,
    files: row.files.map((entry) => ({
      id: entry.id,
      filename: entry.filename,
      version: entry.version,
      versionCount: entry.versionCount,
      commentCount: entry.commentCount,
    })),
  }));

  return <DeliverablesBoard rows={wire} summary={summary} />;
}
