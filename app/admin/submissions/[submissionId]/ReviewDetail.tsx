'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
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
  Tag,
  Textarea,
} from '../../../../components/ui';
import { AI_KEY_MISSING_NOTE } from '@/lib/ai/notice';
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
  submitted: 'Before the council',
  under_review: 'Under deliberation',
  accepted: 'Proclaimed',
  waitlisted: 'Held in reserve',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
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
  const [scores, setScores] = useState<Record<string, number>>(() =>
    Object.fromEntries(props.myScores.map((entry) => [entry.criterionId, entry.value])),
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

  const scoreList = useMemo<ScoreWire[]>(
    () =>
      criteria
        .filter((criterion) => typeof scores[criterion.id] === 'number')
        .map((criterion) => ({ criterionId: criterion.id, value: scores[criterion.id] })),
    [criteria, scores],
  );

  const setScore = useCallback((criterionId: string, value: number) => {
    setScores((current) => ({ ...current, [criterionId]: value }));
    setDirty(true);
    setMessage(null);
  }, []);

  const save = useCallback(
    (complete: boolean) => {
      if (!roundId) {
        setError('This assembly has no council yet. Convene one under Councils.');
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
        setMessage('Decision recorded.');
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
      setMessage('AI suggestion generated. It is advisory — nothing was decided.');
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
        setMessage(assigned ? 'Councillor summoned.' : 'Councillor released.');
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

  useEffect(() => {
    const isTyping = (target: EventTarget | null) => {
      const node = target as HTMLElement | null;
      if (!node) return false;
      return (
        node.tagName === 'INPUT' ||
        node.tagName === 'TEXTAREA' ||
        node.tagName === 'SELECT' ||
        node.isContentEditable
      );
    };

    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;

      if (/^[1-9]$/.test(event.key) && criteria.length > 0) {
        event.preventDefault();
        const index = Math.max(0, Math.min(criteria.length - 1, activeCriterion));
        const criterion = criteria[index];
        const value = Math.min(criterion.maxScore, Number(event.key));
        setScore(criterion.id, value);
        setActiveCriterion(Math.min(criteria.length - 1, index + 1));
        return;
      }

      switch (event.key) {
        case 'j':
          event.preventDefault();
          go(props.nextHref);
          break;
        case 'k':
          event.preventDefault();
          go(props.prevHref);
          break;
        case 'ArrowDown':
          event.preventDefault();
          setActiveCriterion((index) => Math.min(criteria.length - 1, index + 1));
          break;
        case 'ArrowUp':
          event.preventDefault();
          setActiveCriterion((index) => Math.max(0, index - 1));
          break;
        case 's':
          event.preventDefault();
          save(false);
          break;
        case 'c':
          event.preventDefault();
          save(true);
          break;
        case 'a':
          event.preventDefault();
          decide('accept');
          break;
        case 'w':
          event.preventDefault();
          decide('waitlist');
          break;
        case 'd':
          event.preventDefault();
          decide('decline');
          break;
        case 'u':
          event.preventDefault();
          router.push(props.backHref);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    activeCriterion,
    criteria,
    decide,
    go,
    props.backHref,
    props.nextHref,
    props.prevHref,
    router,
    save,
    setScore,
  ]);

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
            <span className={styles.detailRef}>{props.displayRef}</span>
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
              <CardTitle>Argument</CardTitle>
            </CardHeader>
            <CardBody>
              {props.descriptionHtml ? (
                <div
                  className={styles.prose}
                  dangerouslySetInnerHTML={{ __html: props.descriptionHtml }}
                />
              ) : (
                <p className={styles.muted}>No written argument was provided.</p>
              )}
            </CardBody>
          </Card>

          {props.answers.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Answers on the scroll</CardTitle>
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
                <CardTitle>Orators</CardTitle>
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
                <CardTitle>Councillor assignments</CardTitle>
              </CardHeader>
              <CardBody>
                <div className={styles.stack}>
                  {props.availableReviewers.map((reviewer) => {
                    const assignment = assignmentByReviewer.get(reviewer.userId);
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
                      </label>
                    );
                  })}
                  {props.availableReviewers.length === 0 ? (
                    <p className={styles.muted}>
                      Summon councillors from the Councils page before entrusting this petition.
                    </p>
                  ) : null}
                  <p className={styles.aiNote}>
                    Appointed councillors see this petition in {props.round.name}.
                  </p>
                </div>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Your judgment</CardTitle>
            </CardHeader>
            <CardBody>
              {props.round ? (
                <p className={styles.aiNote}>
                  {props.round.name} · {props.round.status}
                  {props.round.blindUntilClose ? ' · blind' : ''}
                </p>
              ) : (
                <p className={styles.muted}>No council has yet been convened.</p>
              )}

              {criteria.map((criterion, index) => (
                <div
                  key={criterion.id}
                  className={styles.criterion}
                  data-active={index === activeCriterion}
                >
                  <div className={styles.criterionHead}>
                    <span className={styles.criterionLabel}>{criterion.label}</span>
                    <span className={styles.criterionWeight}>×{criterion.weight}</span>
                  </div>
                  {criterion.description ? (
                    <span className={styles.criterionDescription}>{criterion.description}</span>
                  ) : null}
                  <div className={styles.criterionControl} onFocus={() => setActiveCriterion(index)}>
                    <ScoreStars
                      value={scores[criterion.id] ?? 0}
                      max={criterion.maxScore}
                      readOnly={false}
                      label={criterion.label}
                      onChange={(value) => {
                        setActiveCriterion(index);
                        setScore(criterion.id, value);
                      }}
                    />
                    <span className={styles.criterionValue}>
                      {scores[criterion.id] ? `${scores[criterion.id]}/${criterion.maxScore}` : '—'}
                    </span>
                    {index === activeCriterion ? <Kbd size="sm">1–{criterion.maxScore}</Kbd> : null}
                  </div>
                </div>
              ))}

              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="review-comment">
                  Counsel to the council
                </label>
                <Textarea
                  id="review-comment"
                  rows={4}
                  value={comment}
                  placeholder="What the council should weigh before its verdict."
                  onChange={(event) => {
                    setComment(event.target.value);
                    setDirty(true);
                  }}
                />
              </div>

              <div className={styles.inlineStack}>
                <Button size="sm" loading={pending} onClick={() => save(false)}>
                  Set judgment aside
                </Button>
                <Button size="sm" variant="primary" loading={pending} onClick={() => save(true)}>
                  {submitted ? 'Revise judgment' : 'Cast judgment'}
                </Button>
                {dirty ? <span className={styles.aiNote}>Unrecorded revisions</span> : null}
              </div>

              <div className={styles.scoreSummary}>
                <span className={styles.bigScore}>
                  {savedAverage === null ? '—' : savedAverage.toFixed(1)}
                </span>
                <span className={styles.scoreOutOf}>your recorded judgment, out of 5</span>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Voice of the council</CardTitle>
            </CardHeader>
            <CardBody>
              <div className={styles.scoreSummary}>
                <span className={styles.bigScore}>
                  {props.summary.average === null ? '—' : props.summary.average.toFixed(1)}
                </span>
                <span className={styles.scoreOutOf}>
                  out of 5 · {props.summary.completedCount}/{props.summary.assignedCount} judgments
                  cast
                </span>
              </div>
              {props.summary.average !== null ? (
                <ScoreStars value={props.summary.average} max={5} label="Council score" />
              ) : null}
              {props.summary.spread !== null ? (
                <p className={styles.aiNote}>Spread {props.summary.spread.toFixed(1)} across councillors
                </p>
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
                      {reviewer.comment ? (
                        <p className={styles.reviewerComment}>{reviewer.comment}</p>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className={styles.muted}>No other councillors are assigned to this petition.
                  </p>
                )
              ) : (
                <p className={styles.notice}>
                  {peers.length > 0
                    ? `${peers.length} other councillor${peers.length === 1 ? '' : 's'} appointed. Cast your judgment to unseal theirs.`
                    : 'Cast your judgment to see the other councillors.'}
                </p>
              )}
              {props.blinded ? (
                <p className={styles.aiNote}>The other ballots remain sealed until this council closes.
                </p>
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
                        setMessage('Copied into your tablet. Nothing enters the annals until you lodge it.');
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
                <CardTitle>Final decree</CardTitle>
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
              <div className={styles.keyLegend}>
                <span className={styles.keyRow}>
                  <Kbd>j</Kbd> next petition
                </span>
                <span className={styles.keyRow}>
                  <Kbd>k</Kbd> previous petition
                </span>
                <span className={styles.keyRow}>
                  <Kbd>1</Kbd>–<Kbd>9</Kbd> score, then advance
                </span>
                <span className={styles.keyRow}>
                  <Kbd>↑</Kbd>
                  <Kbd>↓</Kbd> pick criterion
                </span>
                <span className={styles.keyRow}>
                  <Kbd>s</Kbd> set judgment aside
                </span>
                <span className={styles.keyRow}>
                  <Kbd>c</Kbd> cast judgment
                </span>
                {props.canDecide ? (
                  <>
                    <span className={styles.keyRow}>
                      <Kbd>a</Kbd> accept
                    </span>
                    <span className={styles.keyRow}>
                      <Kbd>w</Kbd> waitlist
                    </span>
                    <span className={styles.keyRow}>
                      <Kbd>d</Kbd> decline
                    </span>
                  </>
                ) : null}
                <span className={styles.keyRow}>
                  <Kbd>u</Kbd> back to the rolls
                </span>
              </div>
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}
