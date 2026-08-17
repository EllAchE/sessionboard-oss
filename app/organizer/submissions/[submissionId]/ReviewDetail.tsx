'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronLeft, ChevronRight, Clock, RotateCcw, Sparkles, X } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Checkbox,
  Kbd,
  ScoreStars,
  Select,
  Tag,
  Textarea,
} from '../../../../components/ui';
import { useHotkeys } from '@/components/hotkeys/HotkeyProvider';
import { KeyLegend } from '@/components/hotkeys/KeyLegend';
import { AI_KEY_MISSING_NOTE } from '@/lib/ai/notice';
import { SCOPES } from '@/lib/hotkeys/registry';
import { CopyPermalinkButton } from '../CopyPermalinkButton';
import {
  assignOneAction,
  decideAction,
  generateAiReviewAction,
  saveScorecardAction,
  unassignAction,
} from '../actions';
import type { AiReviewWire, ScoreWire } from '../types';
import styles from '../submissions.module.css';

export type DetailCriterion = {
  id: string;
  label: string;
  description: string | null;
  /** `ABS-03`: which control this line of the scorecard renders. */
  type: 'numeric' | 'select' | 'text';
  /** The choices for a `select` criterion; empty for the others. */
  options: string[];
  weight: number;
  maxScore: number;
};

export type DetailReviewer = {
  assignmentId: string;
  reviewerUserId: string;
  reviewerName: string;
  status: string;
  comment: string | null;
  completedAt: string | null;
  average: number | null;
  isMe: boolean;
  /** This reviewer's non-numeric answers, already resolved to label and text for display. */
  answers: Array<{ label: string; text: string }>;
};

export type DetailSpeaker = {
  participantId: string;
  name: string;
  email: string;
  jobTitle: string | null;
  company: string | null;
  bioHtml: string;
  isPrimary: boolean;
};

export type ReviewDetailProps = {
  submissionId: string;
  displayRef: string;
  title: string;
  status: string;
  descriptionHtml: string;
  level: string | null;
  trackName: string | null;
  formatName: string | null;
  tags: Array<{ id: string; name: string }>;
  answers: Array<{ key: string; label: string; value: string }>;
  submittedAt: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  submitterName: string;
  submitterEmail: string;
  speakers: DetailSpeaker[];
  round: { id: string; name: string; status: string; blindUntilClose: boolean } | null;
  criteria: DetailCriterion[];
  myScores: ScoreWire[];
  myComment: string | null;
  mySubmitted: boolean;
  myAverage: number | null;
  reviewers: DetailReviewer[];
  availableReviewers: Array<{ userId: string; name: string; email: string }>;
  /** `F-3` on this one talk: who its track routes to, and who can never have it. */
  routedReviewerUserIds: string[];
  conflictedReviewerUserIds: string[];
  summary: {
    average: number | null;
    spread: number | null;
    assignedCount: number;
    completedCount: number;
    scoredCount: number;
  };
  blinded: boolean;
  ai: AiReviewWire | null;
  aiEnabled: boolean;
  aiModelConfigured: boolean;
  canDecide: boolean;
  prevHref: string | null;
  nextHref: string | null;
  position: number | null;
  total: number;
  backHref: string;
};

const STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  draft: 'neutral',
  submitted: 'info',
  under_review: 'info',
  accepted: 'success',
  waitlisted: 'warning',
  declined: 'danger',
  withdrawn: 'neutral',
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'In review',
  accepted: 'Accepted',
  waitlisted: 'Waitlist',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  // Pinned locale and zone: this renders on a UTC Worker and rehydrates in the reader's own zone.
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * The scorecard is meant to be worked through without a mouse: `j`/`k` walk the queue, the number
 * keys score the highlighted criterion and step to the next one, so a reviewer can clear a pile by
 * typing `4 5 3 s j`. Every shortcut is printed in the legend beneath the card — the whole point of
 * a keyboard surface is lost if you have to be told it exists.
 */
export function ReviewDetail(props: ReviewDetailProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  /**
   * `ABS-03`. Numbers and words are kept in separate maps, exactly as they are in storage: a
   * dropdown choice must never reach the weighted average, and a rating must never be saved as text.
   */
  const [scores, setScores] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      props.myScores
        .filter((entry) => typeof entry.value === 'number')
        .map((entry) => [entry.criterionId, entry.value as number]),
    ),
  );
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      props.myScores
        .filter((entry) => typeof entry.text === 'string' && entry.text.length > 0)
        .map((entry) => [entry.criterionId, entry.text as string]),
    ),
  );
  const [comment, setComment] = useState(props.myComment ?? '');
  const [activeCriterion, setActiveCriterion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAverage, setSavedAverage] = useState<number | null>(props.myAverage);
  const [submitted, setSubmitted] = useState(props.mySubmitted);
  const [ai, setAi] = useState<AiReviewWire | null>(props.ai);

  const criteria = props.criteria;
  const roundId = props.round?.id ?? null;
  const assignmentByReviewer = useMemo(
    () => new Map(props.reviewers.map((reviewer) => [reviewer.reviewerUserId, reviewer])),
    [props.reviewers],
  );

  /** Only these carry a rating, and only these answer to the number keys. */
  const ratedCriteria = useMemo(
    () => criteria.filter((criterion) => criterion.type === 'numeric'),
    [criteria],
  );

  const scoreList = useMemo<ScoreWire[]>(
    () =>
      criteria
        .map((criterion): ScoreWire | null => {
          if (criterion.type === 'numeric') {
            const value = scores[criterion.id];
            return typeof value === 'number' ? { criterionId: criterion.id, value } : null;
          }
          const text = (textAnswers[criterion.id] ?? '').trim();
          return text ? { criterionId: criterion.id, value: null, text } : null;
        })
        .filter((entry): entry is ScoreWire => entry !== null),
    [criteria, scores, textAnswers],
  );

  const setScore = useCallback((criterionId: string, value: number) => {
    setScores((current) => ({ ...current, [criterionId]: value }));
    setDirty(true);
    setMessage(null);
  }, []);

  const setTextAnswer = useCallback((criterionId: string, value: string) => {
    setTextAnswers((current) => ({ ...current, [criterionId]: value }));
    setDirty(true);
    setMessage(null);
  }, []);

  const save = useCallback(
    (complete: boolean) => {
      if (!roundId) {
        setError('This event has no review round yet. Create one under Rounds.');
        return;
      }
      setError(null);
      setMessage(null);
      startTransition(async () => {
        const result = await saveScorecardAction({
          roundId,
          submissionId: props.submissionId,
          scores: scoreList,
          comment,
          complete,
        });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setSavedAverage(result.data.average);
        setSubmitted(result.data.complete);
        setDirty(false);
        setMessage(result.data.complete ? 'Scorecard submitted.' : 'Draft saved.');
        router.refresh();
      });
    },
    [comment, props.submissionId, roundId, router, scoreList],
  );

  const decide = useCallback(
    (decision: 'accept' | 'decline' | 'waitlist' | 'reset') => {
      if (!props.canDecide) return;
      setError(null);
      setMessage(null);
      startTransition(async () => {
        const result = await decideAction([props.submissionId], decision);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        if (result.data.skipped.length > 0) {
          setError(result.data.skipped[0].reason);
          return;
        }
        // The decision is recorded either way; the notice is best-effort and says so plainly.
        setMessage(
          result.data.notifyFailed > 0
            ? 'Decision recorded, but the speaker could not be notified.'
            : result.data.notified > 0
              ? 'Decision recorded and the speaker was notified.'
              : 'Decision recorded.',
        );
        router.refresh();
      });
    },
    [props.canDecide, props.submissionId, router],
  );

  const generate = useCallback(() => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await generateAiReviewAction(props.submissionId, roundId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setAi(result.data);
      setMessage('AI suggestion generated. It is advisory, and nothing was decided.');
    });
  }, [props.submissionId, roundId]);

  const setReviewerAssignment = useCallback(
    (reviewerUserId: string, assigned: boolean) => {
      if (!roundId || !props.canDecide) return;
      const current = assignmentByReviewer.get(reviewerUserId);
      if (!assigned && current?.status === 'completed') {
        const confirmed = window.confirm(
          `Remove ${current.reviewerName}'s completed review and its scores?`,
        );
        if (!confirmed) return;
      }

      setError(null);
      setMessage(null);
      startTransition(async () => {
        const result = assigned
          ? await assignOneAction(roundId, props.submissionId, reviewerUserId)
          : current
            ? await unassignAction(current.assignmentId)
            : { ok: true as const, data: null };
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setMessage(assigned ? 'Reviewer assigned.' : 'Reviewer unassigned.');
        router.refresh();
      });
    },
    [assignmentByReviewer, props.canDecide, props.submissionId, roundId, router],
  );

  const go = useCallback(
    (href: string | null) => {
      if (href) router.push(href);
    },
    [router],
  );

  useHotkeys(SCOPES.submissionDetail, {
    /**
     * `1`–`9` scores the criterion under the cursor and advances to the next, so a whole scorecard
     * is a short run of digits. The digit that fired arrives on the event, because the binding
     * covers a range rather than nine separate keys.
     */
    score: (event) => {
      if (ratedCriteria.length === 0) return;
      const index = Math.max(0, Math.min(ratedCriteria.length - 1, activeCriterion));
      const criterion = ratedCriteria[index];
      setScore(criterion.id, Math.min(criterion.maxScore, Number(event.key)));
      setActiveCriterion(Math.min(ratedCriteria.length - 1, index + 1));
    },
    'criterion-next': () =>
      setActiveCriterion((index) => Math.min(ratedCriteria.length - 1, index + 1)),
    'criterion-prev': () => setActiveCriterion((index) => Math.max(0, index - 1)),
    'save-draft': () => save(false),
    submit: () => save(true),

    next: () => go(props.nextHref),
    prev: () => go(props.prevHref),
    back: () => router.push(props.backHref),

    accept: () => decide('accept'),
    waitlist: () => decide('waitlist'),
    decline: () => decide('decline'),
  });

  // Peer scores stay hidden until this reviewer has committed their own, so nobody anchors on a
  // number someone else picked. An organizer who has to decide always sees them.
  const peersVisible = props.canDecide || submitted;
  const peers = props.reviewers.filter((reviewer) => !reviewer.isMe);

  return (
    <div className={styles.page}>
      <div className={styles.navBar}>
        <Button
          variant="ghost"
          size="sm"
          iconLeft={<ChevronLeft size={14} />}
          onClick={() => router.push(props.backHref)}
        >
          Back to queue
        </Button>
        <span className={styles.navPosition}>
          {props.position ? `${props.position} of ${props.total}` : `${props.total} in queue`}
        </span>
        <span className={styles.inlineStack}>
          <Button
            variant="ghost"
            size="sm"
            disabled={!props.prevHref}
            iconLeft={<ChevronLeft size={14} />}
            onClick={() => go(props.prevHref)}
          >
            Previous
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!props.nextHref}
            iconRight={<ChevronRight size={14} />}
            onClick={() => go(props.nextHref)}
          >
            Next
          </Button>
        </span>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {message ? <p className={styles.notice}>{message}</p> : null}

      <div className={styles.detail}>
        <div className={styles.detailMain}>
          <header className={styles.detailHeader}>
            <div className={styles.detailIdentity}>
              <span className={styles.detailRef}>{props.displayRef}</span>
              <CopyPermalinkButton
                path={`/organizer/submissions/${props.submissionId}`}
                subject={props.displayRef}
              />
            </div>
            <h1 className={styles.detailTitle}>{props.title}</h1>
            <div className={styles.metaRow}>
              <Badge tone={STATUS_TONE[props.status] ?? 'neutral'}>
                {STATUS_LABEL[props.status] ?? props.status}
              </Badge>
              {props.trackName ? <Badge tone="info">{props.trackName}</Badge> : null}
              {props.formatName ? <Badge>{props.formatName}</Badge> : null}
              {props.level ? <Badge>{props.level}</Badge> : null}
              {props.tags.map((tag) => (
                <Tag key={tag.id}>{tag.name}</Tag>
              ))}
            </div>
            <p className={styles.speakerMeta}>
              Submitted by {props.submitterName}
              {props.submitterEmail ? ` (${props.submitterEmail})` : ''} ·{' '}
              {formatDate(props.submittedAt)}
            </p>
          </header>

          <Card>
            <CardHeader>
              <CardTitle>Abstract</CardTitle>
            </CardHeader>
            <CardBody>
              {props.descriptionHtml ? (
                <div
                  className={styles.prose}
                  dangerouslySetInnerHTML={{ __html: props.descriptionHtml }}
                />
              ) : (
                <p className={styles.muted}>No description was provided.</p>
              )}
            </CardBody>
          </Card>

          {props.answers.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Form answers</CardTitle>
              </CardHeader>
              <CardBody>
                <div className={styles.answerList}>
                  {props.answers.map((answer) => (
                    <div key={answer.key} className={styles.answer}>
                      <span className={styles.answerKey}>{answer.label}</span>
                      <span className={styles.answerValue}>{answer.value}</span>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          ) : null}

          {props.speakers.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Speakers</CardTitle>
              </CardHeader>
              <CardBody>
                {props.speakers.map((speaker) => (
                  <div key={speaker.participantId} className={styles.speakerRow}>
                    <div className={styles.stack}>
                      <span className={styles.speakerName}>
                        {speaker.name}
                        {speaker.isPrimary ? ' · primary' : ''}
                      </span>
                      <span className={styles.speakerMeta}>
                        {[speaker.jobTitle, speaker.company].filter(Boolean).join(', ') ||
                          speaker.email}
                      </span>
                      {speaker.bioHtml ? (
                        <div
                          className={styles.prose}
                          dangerouslySetInnerHTML={{ __html: speaker.bioHtml }}
                        />
                      ) : null}
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>
          ) : null}
        </div>

        <aside className={styles.detailSide}>
          {props.canDecide && props.round ? (
            <Card>
              <CardHeader>
                <CardTitle>Reviewer assignments</CardTitle>
              </CardHeader>
              <CardBody>
                <div className={styles.stack}>
                  {props.availableReviewers.map((reviewer) => {
                    const assignment = assignmentByReviewer.get(reviewer.userId);
                    const routed = props.routedReviewerUserIds.includes(reviewer.userId);
                    const conflicted = props.conflictedReviewerUserIds.includes(reviewer.userId);
                    return (
                      <label key={reviewer.userId} className={styles.keyRow}>
                        <Checkbox
                          checked={Boolean(assignment)}
                          disabled={pending}
                          onChange={(event) =>
                            setReviewerAssignment(reviewer.userId, event.target.checked)
                          }
                        />
                        <span>
                          {reviewer.name} · {reviewer.email}
                          {assignment?.status === 'completed' ? ' · completed' : ''}
                        </span>
                        {conflicted ? (
                          <Badge tone="danger">Speaks on this talk</Badge>
                        ) : routed ? (
                          <Badge tone="info">Covers this track</Badge>
                        ) : null}
                      </label>
                    );
                  })}
                  {props.availableReviewers.length === 0 ? (
                    <p className={styles.muted}>
                      Invite reviewers from the Rounds page before assigning this submission.
                    </p>
                  ) : null}
                  <p className={styles.aiNote}>
                    Checked reviewers see this submission in their queue for {props.round.name}.{' '}
                    {props.trackName
                      ? props.routedReviewerUserIds.length > 0
                        ? `Auto-assign draws on the ${props.routedReviewerUserIds.length} reviewer${
                            props.routedReviewerUserIds.length === 1 ? '' : 's'
                          } covering ${props.trackName}; checking anyone else here is a deliberate override.`
                        : `Nobody covers ${props.trackName} yet, so auto-assign will report this submission rather than place it.`
                      : 'This submission has no track, so auto-assign has nothing to route on.'}
                  </p>
                </div>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Your scorecard</CardTitle>
            </CardHeader>
            <CardBody>
              {props.round ? (
                <p className={styles.aiNote}>
                  {props.round.name} · {props.round.status}
                  {props.round.blindUntilClose ? ' · blind' : ''}
                </p>
              ) : (
                <p className={styles.muted}>No review round exists yet.</p>
              )}

              {/*
                `ABS-03`: a criterion renders as the control its type calls for. Only the numeric
                ones take part in the digit-key run, so the cursor counts through those alone.
               */}
              {criteria.map((criterion) => {
                const ratedIndex = ratedCriteria.findIndex((entry) => entry.id === criterion.id);
                const active = ratedIndex >= 0 && ratedIndex === activeCriterion;
                return (
                  <div key={criterion.id} className={styles.criterion} data-active={active}>
                    <div className={styles.criterionHead}>
                      <span className={styles.criterionLabel}>{criterion.label}</span>
                      {criterion.type === 'numeric' ? (
                        <span className={styles.criterionWeight}>×{criterion.weight}</span>
                      ) : null}
                    </div>
                    {criterion.description ? (
                      <span className={styles.criterionDescription}>{criterion.description}</span>
                    ) : null}
                    {criterion.type === 'numeric' ? (
                      <div
                        className={styles.criterionControl}
                        onFocus={() => ratedIndex >= 0 && setActiveCriterion(ratedIndex)}
                      >
                        <ScoreStars
                          value={scores[criterion.id] ?? 0}
                          max={criterion.maxScore}
                          readOnly={false}
                          label={criterion.label}
                          onChange={(value) => {
                            if (ratedIndex >= 0) setActiveCriterion(ratedIndex);
                            setScore(criterion.id, value);
                          }}
                        />
                        <span className={styles.criterionValue}>
                          {scores[criterion.id]
                            ? `${scores[criterion.id]}/${criterion.maxScore}`
                            : '—'}
                        </span>
                        {active ? <Kbd size="sm">1–{criterion.maxScore}</Kbd> : null}
                      </div>
                    ) : criterion.type === 'select' ? (
                      <Select
                        aria-label={criterion.label}
                        value={textAnswers[criterion.id] ?? ''}
                        onChange={(event) => setTextAnswer(criterion.id, event.target.value)}
                      >
                        <option value="">Choose…</option>
                        {criterion.options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Textarea
                        aria-label={criterion.label}
                        rows={4}
                        value={textAnswers[criterion.id] ?? ''}
                        onChange={(event) => setTextAnswer(criterion.id, event.target.value)}
                      />
                    )}
                  </div>
                );
              })}

              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="review-comment">
                  Comment
                </label>
                <Textarea
                  id="review-comment"
                  rows={4}
                  value={comment}
                  placeholder="What the committee should know."
                  onChange={(event) => {
                    setComment(event.target.value);
                    setDirty(true);
                  }}
                />
              </div>

              <div className={styles.inlineStack}>
                <Button size="sm" loading={pending} onClick={() => save(false)}>
                  Save draft
                </Button>
                <Button size="sm" variant="primary" loading={pending} onClick={() => save(true)}>
                  {submitted ? 'Update review' : 'Submit review'}
                </Button>
                {dirty ? <span className={styles.aiNote}>Unsaved changes</span> : null}
              </div>

              <div className={styles.scoreSummary}>
                <span className={styles.bigScore}>
                  {savedAverage === null ? '—' : savedAverage.toFixed(1)}
                </span>
                <span className={styles.scoreOutOf}>your saved average, out of 5</span>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Aggregate</CardTitle>
            </CardHeader>
            <CardBody>
              <div className={styles.scoreSummary}>
                <span className={styles.bigScore}>
                  {props.summary.average === null ? '—' : props.summary.average.toFixed(1)}
                </span>
                <span className={styles.scoreOutOf}>
                  out of 5 · {props.summary.completedCount}/{props.summary.assignedCount} reviews in
                </span>
              </div>
              {props.summary.average !== null ? (
                <ScoreStars value={props.summary.average} max={5} label="Aggregate score" />
              ) : null}
              {props.summary.spread !== null ? (
                <p className={styles.aiNote}>Spread {props.summary.spread.toFixed(1)} across reviewers</p>
              ) : null}

              {peersVisible ? (
                peers.length > 0 ? (
                  peers.map((reviewer) => (
                    <div key={reviewer.assignmentId}>
                      <div className={styles.reviewerRow}>
                        <span className={styles.reviewerName}>
                          {reviewer.reviewerName}
                          {reviewer.status === 'completed' ? '' : ' · pending'}
                        </span>
                        <span className={styles.scoreNumber}>
                          {reviewer.average === null ? '—' : reviewer.average.toFixed(1)}
                        </span>
                      </div>
                      {/*
                        `ABS-03`: a dropdown choice and a written answer are findings in their own
                        right, so they read back beside the average rather than vanishing into it.
                       */}
                      {reviewer.answers.map((answer) => (
                        <p key={answer.label} className={styles.reviewerComment}>
                          <strong>{answer.label}:</strong> {answer.text}
                        </p>
                      ))}
                      {reviewer.comment ? (
                        <p className={styles.reviewerComment}>{reviewer.comment}</p>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className={styles.muted}>No other reviewers on this submission.</p>
                )
              ) : (
                <p className={styles.notice}>
                  {peers.length > 0
                    ? `${peers.length} other reviewer${peers.length === 1 ? '' : 's'} assigned. Submit your review to see their scores.`
                    : 'Submit your review to see other reviewers.'}
                </p>
              )}
              {props.blinded ? (
                <p className={styles.aiNote}>This round is blind until it closes.</p>
              ) : null}
            </CardBody>
          </Card>

          {props.aiEnabled || ai ? (
            <Card className={styles.aiCard}>
              <CardHeader>
                <span className={styles.aiLabel}>
                  <Sparkles size={12} aria-hidden /> AI suggestion
                </span>
              </CardHeader>
              <CardBody>
                <p className={styles.aiNote}>
                  {props.aiModelConfigured
                    ? 'Generated by a language model. It is advisory only: it never records a score for you and never decides an outcome.'
                    : AI_KEY_MISSING_NOTE}
                </p>
                {ai ? (
                  <>
                    <div
                      className={styles.prose}
                      dangerouslySetInnerHTML={{ __html: ai.rationaleHtml }}
                    />
                    {ai.criterionScores.map((entry) => {
                      const criterion = criteria.find((item) => item.id === entry.criterionId);
                      if (!criterion) return null;
                      return (
                        <div key={entry.criterionId} className={styles.aiScoreRow}>
                          <span className={styles.reviewerName}>{criterion.label}</span>
                          <span className={styles.scoreNumber}>
                            {entry.value}/{criterion.maxScore}
                          </span>
                        </div>
                      );
                    })}
                    <p className={styles.aiNote}>
                      {ai.model} · {formatDate(ai.createdAt)}
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setScores((current) => {
                          const next = { ...current };
                          for (const entry of ai.criterionScores) next[entry.criterionId] = entry.value;
                          return next;
                        });
                        setDirty(true);
                        setMessage('Copied into your scorecard. Nothing is saved until you submit.');
                      }}
                    >
                      Copy into my scorecard
                    </Button>
                  </>
                ) : null}
                {props.aiEnabled ? (
                  <Button size="sm" variant="ghost" loading={pending} onClick={generate}>
                    {ai ? 'Regenerate' : 'Generate suggestion'}
                  </Button>
                ) : null}
              </CardBody>
            </Card>
          ) : null}

          {props.canDecide ? (
            <Card>
              <CardHeader>
                <CardTitle>Decision</CardTitle>
              </CardHeader>
              <CardBody>
                <div className={styles.inlineStack}>
                  <Button
                    size="sm"
                    variant="primary"
                    loading={pending}
                    iconLeft={<Check size={14} />}
                    onClick={() => decide('accept')}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    loading={pending}
                    iconLeft={<Clock size={14} />}
                    onClick={() => decide('waitlist')}
                  >
                    Waitlist
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    loading={pending}
                    iconLeft={<X size={14} />}
                    onClick={() => decide('decline')}
                  >
                    Decline
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={pending}
                    iconLeft={<RotateCcw size={14} />}
                    onClick={() => decide('reset')}
                  >
                    Reset
                  </Button>
                </div>
                {props.decidedAt ? (
                  <p className={styles.aiNote}>Decided {formatDate(props.decidedAt)}</p>
                ) : null}
                {props.decisionNote ? (
                  <p className={styles.answerValue}>{props.decisionNote}</p>
                ) : null}
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Keyboard</CardTitle>
            </CardHeader>
            <CardBody>
              <KeyLegend
                scope={SCOPES.submissionDetail}
                className={styles.keyLegend}
                rowClassName={styles.keyRow}
                rows={[
                  { id: 'score', text: 'score, then advance' },
                  { id: 'criterion-prev', text: 'previous criterion' },
                  { id: 'criterion-next', text: 'next criterion' },
                  { id: 'save-draft', text: 'save draft' },
                  { id: 'submit', text: 'submit review' },
                  ...(props.canDecide
                    ? [
                        { id: 'accept', text: 'accept' },
                        { id: 'waitlist', text: 'waitlist' },
                        { id: 'decline', text: 'decline' },
                      ]
                    : []),
                  { id: 'prev', text: 'previous submission' },
                  { id: 'next', text: 'next submission' },
                  { id: 'back', text: 'back to queue' },
                ]}
              />
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}
