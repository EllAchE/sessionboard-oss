'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BellRing, ChevronLeft, Plus, Trash2, UserMinus } from 'lucide-react';
import {
  describeRoundDates,
  fromRoundDateDraft,
  roundDatesAreOutOfOrder,
  toRoundDateDraft,
  type RoundDateDraft,
  type RoundDateWire,
} from '../../../../lib/review-round-dates';
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
  deleteCriterionAction,
  deleteRoundAction,
  updateCriterionAction,
  updateRoundAction,
} from '../actions';
import { createRoundAction, releaseAssignmentAction, remindReviewersAction } from './actions';
import styles from '../submissions.module.css';

export type RoundWire = {
  id: string;
  name: string;
  status: 'draft' | 'open' | 'closed';
  blindUntilClose: boolean;
  anonymized: boolean;
  opensAt: string | null;
  closesAt: string | null;
  assignedCount: number;
  completedCount: number;
  declinedCount: number;
};

export type RecusalWire = {
  assignmentId: string;
  displayRef: string;
  title: string;
  reviewerName: string;
  reason: string | null;
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
  recusals: RecusalWire[];
  outstandingReviewerCount: number;
};

const STATUS_TONE: Record<string, 'neutral' | 'info' | 'success'> = {
  draft: 'neutral',
  open: 'info',
  closed: 'success',
};

const EMPTY_DATES: RoundDateDraft = { opensAt: '', closesAt: '' };
const INVALID_DATE_RANGE = 'Close must be after open.';

function RoundDateInputs({
  draft,
  invalidRange,
  labelPrefix,
  onChange,
}: {
  draft: RoundDateDraft;
  invalidRange: boolean;
  labelPrefix: string;
  onChange: (draft: RoundDateDraft) => void;
}) {
  return (
    <>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Opens</span>
        <Input
          inputSize="sm"
          type="datetime-local"
          aria-label={`${labelPrefix} opens`}
          value={draft.opensAt}
          onChange={(event) => onChange({ ...draft, opensAt: event.target.value })}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Closes</span>
        <Input
          inputSize="sm"
          type="datetime-local"
          aria-label={`${labelPrefix} closes`}
          invalid={invalidRange}
          value={draft.closesAt}
          onChange={(event) => onChange({ ...draft, closesAt: event.target.value })}
        />
      </label>
    </>
  );
}

function RoundDateEditor({
  round,
  pending,
  onSave,
}: {
  round: RoundWire;
  pending: boolean;
  onSave: (dates: RoundDateWire) => void;
}) {
  const [draft, setDraft] = useState<RoundDateDraft>(() => toRoundDateDraft(round));

  useEffect(() => {
    setDraft(toRoundDateDraft(round));
  }, [round.opensAt, round.closesAt]);

  const dates = fromRoundDateDraft(draft);
  const invalidRange = roundDatesAreOutOfOrder(dates.opensAt, dates.closesAt);
  const changed = dates.opensAt !== round.opensAt || dates.closesAt !== round.closesAt;

  return (
    <div className={styles.roundDates}>
      <RoundDateInputs
        draft={draft}
        invalidRange={invalidRange}
        labelPrefix={round.name}
        onChange={setDraft}
      />
      <Button
        size="sm"
        variant="secondary"
        disabled={!changed || invalidRange}
        loading={pending}
        onClick={() => onSave(dates)}
      >
        Save dates
      </Button>
      <span className={invalidRange ? styles.dateError : styles.roundDateSummary}>
        {invalidRange ? INVALID_DATE_RANGE : describeRoundDates(round)}
      </span>
    </div>
  );
}

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
  const [newRoundAnonymized, setNewRoundAnonymized] = useState(false);
  const [newRoundDates, setNewRoundDates] = useState<RoundDateDraft>(EMPTY_DATES);
  const [reminderNote, setReminderNote] = useState('');

  const [criterionLabel, setCriterionLabel] = useState('');
  const [criterionWeight, setCriterionWeight] = useState('1');
  const [criterionMax, setCriterionMax] = useState('5');

  const [selectedReviewers, setSelectedReviewers] = useState<string[]>(() =>
    props.reviewers.map((reviewer) => reviewer.userId),
  );
  const [perSubmission, setPerSubmission] = useState('2');

  const selectedRound = props.rounds.find((round) => round.id === props.selectedRoundId) ?? null;
  const newRoundDateWire = fromRoundDateDraft(newRoundDates);
  const newRoundDateRangeIsInvalid = roundDatesAreOutOfOrder(
    newRoundDateWire.opensAt,
    newRoundDateWire.closesAt,
  );

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
            {props.rounds.flatMap((round) => [
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
                <span className={styles.keyRow}>
                  <Switch
                    size="sm"
                    checked={round.anonymized}
                    aria-label={`Anonymized authorship for ${round.name}`}
                    onCheckedChange={(checked) =>
                      run(
                        () => updateRoundAction(round.id, { anonymized: checked }),
                        checked
                          ? 'Reviewers can no longer see who submitted.'
                          : 'Reviewers can see who submitted again.',
                      )
                    }
                  />
                  Anonymized
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
              </div>,
              <RoundDateEditor
                key={`${round.id}-dates`}
                round={round}
                pending={pending}
                onSave={(dates) =>
                  run(() => updateRoundAction(round.id, dates), 'Round dates updated.')
                }
              />,
            ])}
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
              <span className={styles.keyRow}>
                <Switch
                  size="sm"
                  checked={newRoundAnonymized}
                  aria-label="Anonymized authorship"
                  onCheckedChange={setNewRoundAnonymized}
                />
                Anonymized
              </span>
              <Button
                size="sm"
                variant="primary"
                iconLeft={<Plus size={14} />}
                disabled={newRoundDateRangeIsInvalid}
                loading={pending}
                onClick={() =>
                  run(async () => {
                    const result = await createRoundAction({
                      name: newRoundName,
                      blindUntilClose: newRoundBlind,
                      anonymized: newRoundAnonymized,
                      ...newRoundDateWire,
                    });
                    if (result.ok) {
                      setNewRoundName('');
                      setNewRoundDates(EMPTY_DATES);
                    }
                    return result;
                  }, 'Round created with the default scorecard.')
                }
              >
                Add round
              </Button>
            </div>
            <div className={styles.roundDates}>
              <RoundDateInputs
                draft={newRoundDates}
                invalidRange={newRoundDateRangeIsInvalid}
                labelPrefix="New round"
                onChange={setNewRoundDates}
              />
              <span className={styles.roundDateTimezone}>Browser timezone</span>
              <span
                className={newRoundDateRangeIsInvalid ? styles.dateError : styles.roundDateSummary}
              >
                {newRoundDateRangeIsInvalid
                  ? INVALID_DATE_RANGE
                  : 'Leave either date empty when the round has no boundary.'}
              </span>
            </div>
            <p className={styles.aiNote}>
              Blind hides other reviewers&rsquo; scores until the round closes. Anonymized hides the
              author from reviewers — names, contact details, affiliations and bios are stripped
              from what they see, while organizers keep all of it for conflict checks and decisions.
            </p>
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

                <div className={styles.inlineStack}>
                  <Input
                    inputSize="sm"
                    placeholder="Optional line to include, e.g. a deadline"
                    aria-label="Reminder note"
                    value={reminderNote}
                    onChange={(event) => setReminderNote(event.target.value)}
                  />
                  <Button
                    size="sm"
                    iconLeft={<BellRing size={14} />}
                    loading={pending}
                    disabled={props.outstandingReviewerCount === 0}
                    onClick={() =>
                      run(async () => {
                        const result = await remindReviewersAction(selectedRound.id, {
                          note: reminderNote.trim() ? reminderNote.trim() : null,
                        });
                        if (result.ok) setReminderNote('');
                        return result;
                      }, 'Reminder sent. Every message is recorded in Mail.')
                    }
                  >
                    Remind outstanding reviewers
                  </Button>
                  <span className={styles.aiNote}>
                    {props.outstandingReviewerCount === 0
                      ? 'Nobody has an outstanding assignment in this round.'
                      : `${props.outstandingReviewerCount} reviewer${
                          props.outstandingReviewerCount === 1 ? '' : 's'
                        } still owe scores. Each send is logged under Mail.`}
                  </span>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recusals · {selectedRound.declinedCount}</CardTitle>
            </CardHeader>
            <CardBody>
              <div className={styles.stack}>
                {props.recusals.map((recusal) => (
                  <div key={recusal.assignmentId} className={styles.criterionEditor}>
                    <span>
                      <strong>{recusal.displayRef}</strong> {recusal.title}
                    </span>
                    <span className={styles.muted}>{recusal.reviewerName}</span>
                    <span className={styles.muted}>{recusal.reason ?? 'No reason given'}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      iconLeft={<UserMinus size={14} />}
                      loading={pending}
                      onClick={() =>
                        run(
                          () => releaseAssignmentAction(recusal.assignmentId),
                          'Assignment released. Auto-assign will hand it to someone else.',
                        )
                      }
                    >
                      Release
                    </Button>
                  </div>
                ))}
                {props.recusals.length === 0 ? (
                  <p className={styles.muted}>No reviewer has recused themselves in this round.</p>
                ) : null}
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
