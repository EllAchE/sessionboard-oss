'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, EyeOff, UserMinus } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Dialog,
  ScoreStars,
  Select,
  Tag,
  Textarea,
} from '@/components/ui';
import { weightedScore } from '@/lib/review-scoring';
import { recuseAction, saveMyScorecardAction } from '../actions';
import type { CriterionWire, RoundWire, ScoreWire } from '../types';
import styles from '../review.module.css';

export type ScorecardSpeaker = {
  participantId: string;
  name: string;
  affiliation: string;
  bioHtml: string;
};

export type ReviewerScorecardProps = {
  submissionId: string;
  displayRef: string;
  title: string;
  descriptionHtml: string;
  status: string;
  level: string | null;
  trackName: string | null;
  formatName: string | null;
  tags: Array<{ id: string; name: string }>;
  answers: Array<{ key: string; label: string; value: string }>;
  authorHidden: boolean;
  submitterName: string;
  speakers: ScorecardSpeaker[];
  round: RoundWire | null;
  criteria: CriterionWire[];
  myScores: ScoreWire[];
  myComment: string | null;
  myAssignmentId: string | null;
  mySubmitted: boolean;
  blinded: boolean;
  peerCount: number;
  prevHref: string | null;
  nextHref: string | null;
  position: number | null;
  total: number;
};

/**
 * The reviewer's scoring surface. It deliberately carries no accept/decline decision control and no
 * AI panel — those are organizer tools, and this route is reachable by a reviewer.
 */
export function ReviewerScorecard(props: ReviewerScorecardProps) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const [recusing, startRecusing] = useTransition();
  /**
   * `ABS-03`. Numbers and words are held apart in state exactly as they are in storage, so a
   * dropdown choice can never leak into the weighted average and a rating can never be saved as a
   * string. `textAnswers` covers the `select` and `text` criteria, `scores` the numeric ones.
   */
  const [scores, setScores] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      props.myScores
        .filter((score) => typeof score.value === 'number')
        .map((score) => [score.criterionId, score.value as number]),
    ),
  );
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      props.myScores
        .filter((score) => typeof score.text === 'string' && score.text.length > 0)
        .map((score) => [score.criterionId, score.text as string]),
    ),
  );
  const [comment, setComment] = useState(props.myComment ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recusalOpen, setRecusalOpen] = useState(false);
  const [reason, setReason] = useState('');

  const numericCriteria = useMemo(
    () => props.criteria.filter((criterion) => criterion.type === 'numeric'),
    [props.criteria],
  );

  const answered = useCallback(
    (criterion: CriterionWire) =>
      criterion.type === 'numeric'
        ? Boolean(scores[criterion.id])
        : Boolean((textAnswers[criterion.id] ?? '').trim()),
    [scores, textAnswers],
  );

  const scoredCount = numericCriteria.filter((criterion) => scores[criterion.id]).length;
  /**
   * A written criterion is a prompt, not a gate: an organizer who wants "anything else?" on the
   * scorecard should not be able to trap a reviewer who has nothing to add. Ratings and dropdowns
   * are choices the reviewer was asked to make, so those must be made before submitting.
   */
  const allScored =
    props.criteria.length > 0 &&
    props.criteria.every((criterion) => criterion.type === 'text' || answered(criterion));

  const preview = useMemo(() => {
    const criteria = numericCriteria.map((criterion, position) => ({ ...criterion, position }));
    const values = criteria
      .filter((criterion) => scores[criterion.id])
      .map((criterion) => ({ criterionId: criterion.id, value: scores[criterion.id] }));
    return weightedScore(criteria, values).average;
  }, [numericCriteria, scores]);

  const save = useCallback(
    (complete: boolean) => {
      if (!props.round) {
        setError('No review round is open, so there is nothing to score against.');
        return;
      }
      setError(null);
      setMessage(null);
      const roundId = props.round.id;
      startSaving(async () => {
        const result = await saveMyScorecardAction({
          roundId,
          submissionId: props.submissionId,
          scores: props.criteria
            .filter((criterion) => answered(criterion))
            .map<ScoreWire>((criterion) =>
              criterion.type === 'numeric'
                ? { criterionId: criterion.id, value: scores[criterion.id], text: null }
                : {
                    criterionId: criterion.id,
                    value: null,
                    text: textAnswers[criterion.id].trim(),
                  },
            ),
          comment: comment.trim() ? comment.trim() : null,
          complete,
        });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setMessage(complete ? 'Review submitted.' : 'Draft saved.');
        router.refresh();
      });
    },
    [answered, comment, props.criteria, props.round, props.submissionId, router, scores, textAnswers],
  );

  const confirmRecusal = useCallback(() => {
    if (!props.myAssignmentId) return;
    const assignmentId = props.myAssignmentId;
    setError(null);
    startRecusing(async () => {
      const result = await recuseAction(assignmentId, reason);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push('/review');
      router.refresh();
    });
  }, [props.myAssignmentId, reason, router]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headings}>
          <span className={styles.detailRef}>{props.displayRef}</span>
          <h1 className={styles.detailTitle}>{props.title}</h1>
          <div className={styles.inlineStack}>
            {props.trackName ? <Tag>{props.trackName}</Tag> : null}
            {props.formatName ? <Tag>{props.formatName}</Tag> : null}
            {props.level ? <Tag>{props.level}</Tag> : null}
            {props.tags.map((tag) => (
              <Tag key={tag.id}>{tag.name}</Tag>
            ))}
          </div>
        </div>
        <div className={styles.actions}>
          {props.position ? (
            <span className={styles.muted}>
              {props.position} of {props.total}
            </span>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            iconLeft={<ChevronLeft size={14} />}
            disabled={!props.prevHref}
            onClick={() => props.prevHref && router.push(props.prevHref)}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="ghost"
            iconLeft={<ChevronRight size={14} />}
            disabled={!props.nextHref}
            onClick={() => props.nextHref && router.push(props.nextHref)}
          >
            Next
          </Button>
        </div>
      </header>

      {error ? <p className={styles.error}>{error}</p> : null}
      {message ? <p className={styles.notice}>{message}</p> : null}

      <div className={styles.detail}>
        <div className={styles.detailMain}>
          <Card>
            <CardHeader>
              <CardTitle>Proposal</CardTitle>
            </CardHeader>
            <CardBody>
              <div
                className={styles.prose}
                dangerouslySetInnerHTML={{ __html: props.descriptionHtml }}
              />
            </CardBody>
          </Card>

          {props.answers.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Questionnaire</CardTitle>
              </CardHeader>
              <CardBody>
                <div className={styles.answerList}>
                  {props.answers.map((answer) => (
                    <div key={answer.key} className={styles.answer}>
                      <span className={styles.answerKey}>{answer.label}</span>
                      <span className={styles.answerValue}>{answer.value || '—'}</span>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>{props.authorHidden ? 'Author' : 'Speakers'}</CardTitle>
            </CardHeader>
            <CardBody>
              {props.authorHidden ? (
                <p className={styles.muted}>
                  <EyeOff size={13} aria-hidden /> This round hides speaker identities.
                </p>
              ) : (
                <div className={styles.answerList}>
                  {props.speakers.map((speaker) => (
                    <div key={speaker.participantId} className={styles.answer}>
                      <span className={styles.answerValue}>{speaker.name}</span>
                      {speaker.affiliation ? (
                        <span className={styles.muted}>{speaker.affiliation}</span>
                      ) : null}
                      {speaker.bioHtml ? (
                        <div
                          className={styles.prose}
                          dangerouslySetInnerHTML={{ __html: speaker.bioHtml }}
                        />
                      ) : null}
                    </div>
                  ))}
                  {props.speakers.length === 0 ? (
                    <span className={styles.muted}>{props.submitterName}</span>
                  ) : null}
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <div className={styles.detailSide}>
          <Card>
            <CardHeader>
              <CardTitle>Your scorecard</CardTitle>
            </CardHeader>
            <CardBody>
              <div className={styles.metaRow}>
                {props.round ? <Badge tone="info">{props.round.name}</Badge> : null}
                {props.mySubmitted ? <Badge tone="success">Submitted</Badge> : null}
                {props.authorHidden ? <Badge tone="warning">Anonymized</Badge> : null}
                {props.blinded ? <Badge>Peer scores hidden until close</Badge> : null}
              </div>

              {props.round ? null : (
                <p className={styles.muted}>No review round is open yet.</p>
              )}

              {props.criteria.map((criterion) => (
                <div key={criterion.id} className={styles.criterion}>
                  <div className={styles.criterionHead}>
                    <span className={styles.criterionLabel} id={`criterion-${criterion.id}`}>
                      {criterion.label}
                    </span>
                    {criterion.type === 'numeric' ? (
                      <span className={styles.criterionWeight}>×{criterion.weight}</span>
                    ) : null}
                  </div>
                  {criterion.description ? (
                    <span className={styles.criterionDescription}>{criterion.description}</span>
                  ) : null}
                  {/* `ABS-03`: one control per criterion type, chosen by the organizer's scorecard. */}
                  {criterion.type === 'numeric' ? (
                    <div className={styles.criterionControl}>
                      <ScoreStars
                        value={scores[criterion.id] ?? 0}
                        max={criterion.maxScore}
                        readOnly={false}
                        label={criterion.label}
                        onChange={(value) =>
                          setScores((current) => ({ ...current, [criterion.id]: value }))
                        }
                      />
                      <span className={styles.criterionValue}>
                        {scores[criterion.id]
                          ? `${scores[criterion.id]}/${criterion.maxScore}`
                          : '—'}
                      </span>
                    </div>
                  ) : criterion.type === 'select' ? (
                    <Select
                      selectSize="sm"
                      aria-label={criterion.label}
                      value={textAnswers[criterion.id] ?? ''}
                      onChange={(event) =>
                        setTextAnswers((current) => ({
                          ...current,
                          [criterion.id]: event.target.value,
                        }))
                      }
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
                      rows={4}
                      aria-label={criterion.label}
                      value={textAnswers[criterion.id] ?? ''}
                      onChange={(event) =>
                        setTextAnswers((current) => ({
                          ...current,
                          [criterion.id]: event.target.value,
                        }))
                      }
                    />
                  )}
                </div>
              ))}

              {props.criteria.length === 0 ? (
                <p className={styles.muted}>No scoring criteria yet.</p>
              ) : null}

              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="reviewer-comment">
                  Comment
                </label>
                <Textarea
                  id="reviewer-comment"
                  rows={4}
                  value={comment}
                  placeholder="What would help the programme committee decide?"
                  onChange={(event) => setComment(event.target.value)}
                />
              </div>

              <div className={styles.scoreSummary}>
                <span className={styles.bigScore}>
                  {preview === null ? '—' : preview.toFixed(1)}
                </span>
                <span className={styles.scoreOutOf}>
                  out of 5 · {scoredCount}/{numericCriteria.length} rated criteria scored
                </span>
              </div>

              <div className={styles.metaRow}>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={saving}
                  disabled={!props.round}
                  onClick={() => save(false)}
                >
                  Save draft
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  loading={saving}
                  disabled={!props.round || !allScored}
                  onClick={() => save(true)}
                >
                  Submit review
                </Button>
              </div>
              {!allScored && props.criteria.length > 0 ? (
                <p className={styles.hint}>
                  Answer every rating and dropdown criterion to submit. Written criteria are
                  optional.
                </p>
              ) : null}
            </CardBody>
          </Card>

          {props.myAssignmentId ? (
            <Card>
              <CardHeader>
                <CardTitle>Conflict of interest</CardTitle>
              </CardHeader>
              <CardBody>
                <p className={styles.muted}>
                  Recusing removes this from your queue for reassignment.
                </p>
                <div className={styles.metaRow}>
                  <Button
                    variant="ghost"
                    size="sm"
                    iconLeft={<UserMinus size={14} />}
                    onClick={() => setRecusalOpen(true)}
                  >
                    Recuse myself
                  </Button>
                </div>
              </CardBody>
            </Card>
          ) : null}

          {props.blinded ? (
            <p className={styles.hint}>
              {props.peerCount} other reviewer{props.peerCount === 1 ? '' : 's'}; scores remain
              hidden until the round closes.
            </p>
          ) : null}
        </div>
      </div>

      <Dialog
        open={recusalOpen}
        onOpenChange={setRecusalOpen}
        title="Recuse yourself from this submission"
        description={`${props.displayRef}: ${props.title}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRecusalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={recusing} onClick={confirmRecusal}>
              Recuse me
            </Button>
          </>
        }
      >
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="recusal-reason-detail">
            Reason (optional)
          </label>
          <Textarea
            id="recusal-reason-detail"
            rows={3}
            value={reason}
            placeholder="Conflict of interest or availability."
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      </Dialog>
    </div>
  );
}
