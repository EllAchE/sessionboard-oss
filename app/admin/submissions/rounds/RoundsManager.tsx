'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Checkbox,
  DataTable,
  Input,
  Select,
  Switch,
  type DataTableColumn,
} from '../../../../components/ui';
import {
  addCriterionAction,
  autoAssignAction,
  createRoundAction,
  deleteCriterionAction,
  deleteRoundAction,
  updateCriterionAction,
  updateRoundAction,
} from '../actions';
import styles from '../submissions.module.css';

export type RoundWire = {
  id: string;
  name: string;
  status: 'draft' | 'open' | 'closed';
  blindUntilClose: boolean;
  assignedCount: number;
  completedCount: number;
};

export type CriterionWire = {
  id: string;
  label: string;
  description: string | null;
  weight: number;
  maxScore: number;
};

export type WorkloadWire = {
  reviewerUserId: string;
  name: string;
  email: string;
  assigned: number;
  completed: number;
  pending: number;
  averageGiven: number | null;
};

export type RoundsManagerProps = {
  rounds: RoundWire[];
  selectedRoundId: string | null;
  criteria: CriterionWire[];
  reviewers: Array<{ userId: string; name: string; email: string; roles: string[] }>;
  workload: WorkloadWire[];
  /** Submissions eligible for assignment in this round — everything still awaiting a verdict. */
  pendingSubmissionIds: string[];
};

const STATUS_TONE: Record<string, 'neutral' | 'info' | 'success'> = {
  draft: 'neutral',
  open: 'info',
  closed: 'success',
};

/**
 * Rounds, their scorecard, and who reviews what. Assignment is deliberately one button over the
 * whole pending pile: the balanced round-robin in `planAssignments` is better at spreading load than
 * an organizer clicking names, and a second pass after new submissions arrive tops up rather than
 * repeating.
 */
export function RoundsManager(props: RoundsManagerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newRoundName, setNewRoundName] = useState('');
  const [newRoundBlind, setNewRoundBlind] = useState(true);

  const [criterionLabel, setCriterionLabel] = useState('');
  const [criterionWeight, setCriterionWeight] = useState('1');
  const [criterionMax, setCriterionMax] = useState('5');

  const [selectedReviewers, setSelectedReviewers] = useState<string[]>(() =>
    props.reviewers.map((reviewer) => reviewer.userId),
  );
  const [perSubmission, setPerSubmission] = useState('2');

  const selectedRound = props.rounds.find((round) => round.id === props.selectedRoundId) ?? null;

  const run = useCallback(
    (work: () => Promise<{ ok: true } | { ok: false; message: string }>, success: string) => {
      setError(null);
      setMessage(null);
      startTransition(async () => {
        const result = await work();
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setMessage(success);
        router.refresh();
      });
    },
    [router],
  );

  const selectRound = (roundId: string) => router.push(`/admin/submissions/rounds?round=${roundId}`);

  const plannedTotal = useMemo(() => {
    const per = Math.max(1, Number(perSubmission) || 1);
    return props.pendingSubmissionIds.length * Math.min(per, selectedReviewers.length || 1);
  }, [perSubmission, props.pendingSubmissionIds.length, selectedReviewers.length]);

  const workloadColumns = useMemo<Array<DataTableColumn<WorkloadWire>>>(
    () => [
      { id: 'name', header: 'Reviewer', strong: true, render: (row) => row.name },
      { id: 'email', header: 'Email', width: '26%', render: (row) => row.email },
      {
        id: 'assigned',
        header: 'Assigned',
        width: '90px',
        align: 'right',
        render: (row) => <span className={styles.progress}>{row.assigned}</span>,
      },
      {
        id: 'done',
        header: 'Done',
        width: '90px',
        align: 'right',
        render: (row) => (
          <span className={styles.progress}>
            {row.completed}/{row.assigned}
          </span>
        ),
      },
      {
        id: 'average',
        header: 'Avg given',
        width: '96px',
        align: 'right',
        render: (row) =>
          row.averageGiven === null ? (
            <span className={styles.muted}>—</span>
          ) : (
            <span className={styles.scoreNumber}>{row.averageGiven.toFixed(1)}</span>
          ),
      },
    ],
    [],
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headings}>
          <span className={styles.eyebrow}>Review</span>
          <h1 className={styles.title}>Rounds</h1>
          <p className={styles.subtitle}>
            {props.rounds.length} round{props.rounds.length === 1 ? '' : 's'} ·{' '}
            {props.pendingSubmissionIds.length} submission
            {props.pendingSubmissionIds.length === 1 ? '' : 's'} awaiting a verdict
          </p>
        </div>
        <div className={styles.actions}>
          <Button
            variant="ghost"
            iconLeft={<ChevronLeft size={14} />}
            onClick={() => router.push('/admin/submissions')}
          >
            Back to queue
          </Button>
        </div>
      </header>

      {error ? <p className={styles.error}>{error}</p> : null}
      {message ? <p className={styles.notice}>{message}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Rounds</CardTitle>
        </CardHeader>
        <CardBody>
          <div className={styles.stack}>
            {props.rounds.map((round) => (
              <div key={round.id} className={styles.criterionEditor}>
                <button
                  type="button"
                  className={styles.tab}
                  data-selected={round.id === props.selectedRoundId}
                  onClick={() => selectRound(round.id)}
                >
                  {round.name}
                  <Badge tone={STATUS_TONE[round.status] ?? 'neutral'}>{round.status}</Badge>
                  <span className={styles.tabCount}>
                    {round.completedCount}/{round.assignedCount} reviews
                  </span>
                </button>
                <Select
                  selectSize="sm"
                  value={round.status}
                  aria-label={`Status of ${round.name}`}
                  onChange={(event) =>
                    run(
                      () =>
                        updateRoundAction(round.id, {
                          status: event.target.value as 'draft' | 'open' | 'closed',
                        }),
                      'Round updated.',
                    )
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                </Select>
                <span className={styles.keyRow}>
                  <Switch
                    size="sm"
                    checked={round.blindUntilClose}
                    aria-label={`Blind review for ${round.name}`}
                    onCheckedChange={(checked) =>
                      run(
                        () => updateRoundAction(round.id, { blindUntilClose: checked }),
                        'Round updated.',
                      )
                    }
                  />
                  Blind
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  iconLeft={<Trash2 size={14} />}
                  loading={pending}
                  onClick={() => run(() => deleteRoundAction(round.id), 'Round deleted.')}
                >
                  Delete
                </Button>
              </div>
            ))}
            {props.rounds.length === 0 ? (
              <p className={styles.muted}>No rounds yet. Create the first one below.</p>
            ) : null}

            <div className={styles.criterionEditor}>
              <Input
                inputSize="sm"
                placeholder="New round name"
                aria-label="New round name"
                value={newRoundName}
                onChange={(event) => setNewRoundName(event.target.value)}
              />
              <span className={styles.keyRow}>
                <Switch
                  size="sm"
                  checked={newRoundBlind}
                  aria-label="Blind until close"
                  onCheckedChange={setNewRoundBlind}
                />
                Blind
              </span>
              <span />
              <Button
                size="sm"
                variant="primary"
                iconLeft={<Plus size={14} />}
                loading={pending}
                onClick={() =>
                  run(async () => {
                    const result = await createRoundAction({
                      name: newRoundName,
                      blindUntilClose: newRoundBlind,
                    });
                    if (result.ok) setNewRoundName('');
                    return result;
                  }, 'Round created with the default scorecard.')
                }
              >
                Add round
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {selectedRound ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Scorecard · {selectedRound.name}</CardTitle>
            </CardHeader>
            <CardBody>
              <div className={styles.stack}>
                {props.criteria.map((criterion) => (
                  <div key={criterion.id} className={styles.criterionEditor}>
                    <Input
                      inputSize="sm"
                      defaultValue={criterion.label}
                      aria-label={`Label for ${criterion.label}`}
                      onBlur={(event) => {
                        if (event.target.value === criterion.label) return;
                        run(
                          () => updateCriterionAction(criterion.id, { label: event.target.value }),
                          'Criterion updated.',
                        );
                      }}
                    />
                    <Input
                      inputSize="sm"
                      type="number"
                      min={0}
                      max={10}
                      defaultValue={criterion.weight}
                      aria-label={`Weight for ${criterion.label}`}
                      onBlur={(event) => {
                        const weight = Number(event.target.value);
                        if (weight === criterion.weight) return;
                        run(
                          () => updateCriterionAction(criterion.id, { weight }),
                          'Criterion updated.',
                        );
                      }}
                    />
                    <Input
                      inputSize="sm"
                      type="number"
                      min={2}
                      max={10}
                      defaultValue={criterion.maxScore}
                      aria-label={`Maximum score for ${criterion.label}`}
                      onBlur={(event) => {
                        const maxScore = Number(event.target.value);
                        if (maxScore === criterion.maxScore) return;
                        run(
                          () => updateCriterionAction(criterion.id, { maxScore }),
                          'Criterion updated.',
                        );
                      }}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      iconLeft={<Trash2 size={14} />}
                      loading={pending}
                      onClick={() =>
                        run(() => deleteCriterionAction(criterion.id), 'Criterion removed.')
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                {props.criteria.length === 0 ? (
                  <p className={styles.muted}>
                    This round has no criteria, so reviewers have nothing to score.
                  </p>
                ) : null}

                <div className={styles.criterionEditor}>
                  <Input
                    inputSize="sm"
                    placeholder="New criterion"
                    aria-label="New criterion label"
                    value={criterionLabel}
                    onChange={(event) => setCriterionLabel(event.target.value)}
                  />
                  <Input
                    inputSize="sm"
                    type="number"
                    min={0}
                    max={10}
                    aria-label="New criterion weight"
                    value={criterionWeight}
                    onChange={(event) => setCriterionWeight(event.target.value)}
                  />
                  <Input
                    inputSize="sm"
                    type="number"
                    min={2}
                    max={10}
                    aria-label="New criterion maximum score"
                    value={criterionMax}
                    onChange={(event) => setCriterionMax(event.target.value)}
                  />
                  <Button
                    size="sm"
                    iconLeft={<Plus size={14} />}
                    loading={pending}
                    onClick={() =>
                      run(async () => {
                        const result = await addCriterionAction(selectedRound.id, {
                          label: criterionLabel,
                          weight: Number(criterionWeight) || 1,
                          maxScore: Number(criterionMax) || 5,
                        });
                        if (result.ok) setCriterionLabel('');
                        return result;
                      }, 'Criterion added.')
                    }
                  >
                    Add
                  </Button>
                </div>
                <p className={styles.aiNote}>
                  Weight scales a criterion against the others; the maximum is the scale a reviewer
                  scores on. Every average is reported back on 1–5 whatever the maximum.
                </p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Assign reviewers</CardTitle>
            </CardHeader>
            <CardBody>
              <div className={styles.stack}>
                <div className={styles.inlineStack}>
                  {props.reviewers.map((reviewer) => (
                    <label key={reviewer.userId} className={styles.keyRow}>
                      <Checkbox
                        checked={selectedReviewers.includes(reviewer.userId)}
                        onChange={(event) =>
                          setSelectedReviewers((current) =>
                            event.target.checked
                              ? [...current, reviewer.userId]
                              : current.filter((id) => id !== reviewer.userId),
                          )
                        }
                      />
                      {reviewer.name}
                    </label>
                  ))}
                  {props.reviewers.length === 0 ? (
                    <p className={styles.muted}>
                      No organizers or reviewers on this event yet. Invite them from the team page.
                    </p>
                  ) : null}
                </div>

                <div className={styles.inlineStack}>
                  <span className={styles.fieldLabel}>Reviewers per submission</span>
                  <Input
                    inputSize="sm"
                    type="number"
                    min={1}
                    max={10}
                    aria-label="Reviewers per submission"
                    value={perSubmission}
                    onChange={(event) => setPerSubmission(event.target.value)}
                  />
                  <Button
                    size="sm"
                    variant="primary"
                    loading={pending}
                    disabled={selectedReviewers.length === 0}
                    onClick={() =>
                      run(
                        () =>
                          autoAssignAction(selectedRound.id, {
                            submissionIds: props.pendingSubmissionIds,
                            reviewerUserIds: selectedReviewers,
                            reviewersPerSubmission: Number(perSubmission) || 1,
                          }),
                        'Assignments balanced across the selected reviewers.',
                      )
                    }
                  >
                    Auto-assign
                  </Button>
                  <span className={styles.aiNote}>
                    Up to {plannedTotal} assignment{plannedTotal === 1 ? '' : 's'} across{' '}
                    {selectedReviewers.length} reviewer
                    {selectedReviewers.length === 1 ? '' : 's'}; existing ones are kept and topped
                    up.
                  </span>
                </div>

                <div className={styles.tableWrap}>
                  <DataTable
                    columns={workloadColumns}
                    rows={props.workload}
                    getRowId={(row) => row.reviewerUserId}
                    label="Reviewer workload"
                    emptyState="No reviewers on this event yet."
                  />
                </div>
              </div>
            </CardBody>
          </Card>
        </>
      ) : (
        <p className={styles.notice}>Create a round to configure its scorecard and assignments.</p>
      )}
    </div>
  );
}
