'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { EyeOff, UserMinus } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  DataTable,
  Dialog,
  Select,
  Textarea,
  type DataTableColumn,
} from '@/components/ui';
import { recuseAction } from './actions';
import { reviewerSubmissionHref } from './links';
import type { AssignmentWire, RoundWire } from './types';
import styles from './review.module.css';

export type ReviewerDashboardProps = {
  eventName: string;
  round: RoundWire | null;
  rounds: RoundWire[];
  authorHidden: boolean;
  criterionCount: number;
  assignments: AssignmentWire[];
  recused: AssignmentWire[];
  pendingCount: number;
  completedCount: number;
};

/**
 * A reviewer's whole job on one screen: what is left, what is done, and one click into the
 * scorecard. No decision controls and no event configuration reach this tree.
 */
export function ReviewerDashboard(props: ReviewerDashboardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recusing, setRecusing] = useState<AssignmentWire | null>(null);
  const [reason, setReason] = useState('');

  const total = props.pendingCount + props.completedCount;
  const percent = total === 0 ? 0 : Math.round((props.completedCount / total) * 100);

  const open = useCallback(
    (row: AssignmentWire) =>
      router.push(reviewerSubmissionHref(row.submissionId, props.round?.id ?? null)),
    [props.round?.id, router],
  );

  const confirmRecusal = useCallback(() => {
    if (!recusing) return;
    const target = recusing;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await recuseAction(target.assignmentId, reason);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setRecusing(null);
      setReason('');
      setMessage(`You have withdrawn from ${target.displayRef}. The magistrates may appoint another councillor.`);
      router.refresh();
    });
  }, [reason, recusing, router]);

  const columns = useMemo<Array<DataTableColumn<AssignmentWire>>>(() => {
    const base: Array<DataTableColumn<AssignmentWire>> = [
      {
        id: 'title',
        header: 'Petition',
        strong: true,
        render: (row) => (
          <span className={styles.rowTitle}>
            <span className={styles.rowRef}>{row.displayRef}</span>
            {row.title}
          </span>
        ),
      },
      {
        id: 'author',
        header: 'Petitioner',
        width: '18%',
        render: (row) =>
          props.authorHidden ? (
            <span className={styles.muted}>
              <EyeOff size={12} aria-hidden /> hidden
            </span>
          ) : (
            row.submitterName
          ),
      },
      { id: 'track', header: 'Theme', width: '14%', render: (row) => row.trackName ?? '—' },
      {
        id: 'status',
        header: 'Standing',
        width: '110px',
        render: (row) =>
          row.status === 'completed' ? (
            <Badge tone="success">Judgment cast</Badge>
          ) : (
            <Badge tone="info">Awaiting judgment</Badge>
          ),
      },
      {
        id: 'score',
        header: 'Your judgment',
        width: '96px',
        align: 'right',
        render: (row) =>
          row.average === null ? (
            <span className={styles.muted}>—</span>
          ) : (
            <span className={styles.scoreNumber}>{row.average.toFixed(1)}</span>
          ),
      },
      {
        id: 'actions',
        header: '',
        width: '176px',
        render: (row) => (
          <span className={styles.rowActions}>
            <Button size="sm" variant="ghost" onClick={() => open(row)}>
              {row.status === 'completed' ? 'Revisit judgment' : 'Judge petition'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              iconLeft={<UserMinus size={13} />}
              onClick={() => {
                setReason('');
                setRecusing(row);
              }}
            >
              Recuse
            </Button>
          </span>
        ),
      },
    ];
    return base;
  }, [open, props.authorHidden]);

  const recusedColumns = useMemo<Array<DataTableColumn<AssignmentWire>>>(
    () => [
      {
        id: 'title',
        header: 'Petition',
        strong: true,
        render: (row) => (
          <span className={styles.rowTitle}>
            <span className={styles.rowRef}>{row.displayRef}</span>
            {row.title}
          </span>
        ),
      },
      {
        id: 'reason',
        header: 'Reason you gave',
        render: (row) => row.comment ?? <span className={styles.muted}>No reason entered</span>,
      },
    ],
    [],
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headings}>
          <span className={styles.eyebrow}>{props.eventName}</span>
          <h1 className={styles.title}>Your deliberations</h1>
          <p className={styles.subtitle}>
            {props.round
              ? `${props.round.name} · ${props.pendingCount} to judge, ${props.completedCount} done`
              : 'No council is open for deliberation.'}
          </p>
        </div>
        {props.rounds.length > 1 ? (
          <div className={styles.actions}>
            <Select
              selectSize="sm"
              aria-label="Council"
              value={props.round?.id ?? ''}
              onChange={(event) => router.push(`/review?round=${event.target.value}`)}
            >
              {props.rounds.map((round) => (
                <option key={round.id} value={round.id}>
                  {round.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
      </header>

      {error ? <p className={styles.error}>{error}</p> : null}
      {message ? <p className={styles.notice}>{message}</p> : null}

      <Card>
        <CardBody>
          <div className={styles.progressCard}>
            <span className={styles.progressStat}>
              <span className={styles.bigNumber}>{props.pendingCount}</span>
              <span className={styles.progressLabel}>judgments remaining</span>
            </span>
            <span className={styles.progressStat}>
              <span className={styles.bigNumber}>{props.completedCount}</span>
              <span className={styles.progressLabel}>judgments cast</span>
            </span>
            <div className={styles.track}>
              <div className={styles.trackFill} style={{ width: `${percent}%` }} />
            </div>
            <span className={styles.progressLabel}>{percent}% complete</span>
          </div>
          <div className={styles.metaRow}>
            {props.round ? <Badge tone="info">{props.round.status}</Badge> : null}
            {props.round?.blindUntilClose ? <Badge>Other ballots sealed</Badge> : null}
            {props.authorHidden ? (
              <Badge tone="warning">Anonymous petition — the author’s name is sealed</Badge>
            ) : null}
            {props.criterionCount === 0 && props.round ? (
              <Badge tone="danger">This council has no criteria yet</Badge>
            ) : null}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Petitions before you</CardTitle>
        </CardHeader>
        <CardBody>
          <div className={styles.tableWrap}>
            <DataTable
              columns={columns}
              rows={props.assignments}
              getRowId={(row) => row.assignmentId}
              label="Your petitions"
              emptyState="No petition has been laid before you in this council."
              onRowActivate={open}
            />
          </div>
        </CardBody>
      </Card>

      {props.recused.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Petitions from which you withdrew</CardTitle>
          </CardHeader>
          <CardBody>
            <p className={styles.muted}>
              These are off your queue. The organizer sees them as declined and can reassign them.
            </p>
            <div className={styles.tableWrap}>
              <DataTable
                columns={recusedColumns}
                rows={props.recused}
                getRowId={(row) => row.assignmentId}
                label="Recused assignments"
                emptyState="Nothing recused."
              />
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Dialog
        open={recusing !== null}
        onOpenChange={(next) => {
          if (!next) setRecusing(null);
        }}
        title="Withdraw from judgment on this petition"
        description={
          recusing
            ? `${recusing.displayRef} — ${recusing.title}. It leaves your queue and the organizer can reassign it.`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setRecusing(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={pending} onClick={confirmRecusal}>
              Recuse me
            </Button>
          </>
        }
      >
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="recusal-reason">
            Reason (optional)
          </label>
          <Textarea
            id="recusal-reason"
            rows={3}
            value={reason}
            placeholder="A conflict of interest, prior allegiance, or simply no capacity."
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      </Dialog>
    </div>
  );
}
