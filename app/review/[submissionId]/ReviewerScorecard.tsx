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
  const [scores, setScores] = useState<Record<string, number>>(() =>
    Object.fromEntries(props.myScores.map((score) => [score.criterionId, score.value])),
  );
  const [comment, setComment] = useState(props.myComment ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recusalOpen, setRecusalOpen] = useState(false);
  const [reason, setReason] = useState('');

  const scoredCount = props.criteria.filter((criterion) => scores[criterion.id]).length;
  const allScored = props.criteria.length > 0 && scoredCount === props.criteria.length;

  const preview = useMemo(() => {
    const criteria = props.criteria.map((criterion, position) => ({ ...criterion, position }));
    const values = criteria
      .filter((criterion) => scores[criterion.id])
      .map((criterion) => ({ criterionId: criterion.id, value: scores[criterion.id] }));
    return weightedScore(criteria, values).average;
  }, [props.criteria, scores]);

  const save = useCallback(
    (complete: boolean) => {
      if (!props.round) {
        setError('No council is open, so there is no decree by which to judge this petition.');
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
            .filter((criterion) => scores[criterion.id])
            .map((criterion) => ({ criterionId: criterion.id, value: scores[criterion.id] })),
          comment: comment.trim() ? comment.trim() : null,
          complete,
        });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setMessage(complete ? 'Judgment cast.' : 'Judgment set aside for later.');
        router.refresh();
      });
    },
    [comment, props.criteria, props.round, props.submissionId, router, scores],
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
              <CardTitle>Petition</CardTitle>
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
                <CardTitle>Answers on the scroll</CardTitle>
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
              <CardTitle>{props.authorHidden ? 'Petitioner' : 'Orators'}</CardTitle>
            </CardHeader>
            <CardBody>
              {props.authorHidden ? (
                <p className={styles.muted}>
                  <EyeOff size={13} aria-hidden /> This council veils its petitioners. Names,
                  affiliations, and biographies are withheld so the petition stands on its own.
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
              <CardTitle>Your judgment</CardTitle>
            </CardHeader>
            <CardBody>
              <div className={styles.metaRow}>
                {props.round ? <Badge tone="info">{props.round.name}</Badge> : null}
                {props.mySubmitted ? <Badge tone="success">Judgment cast</Badge> : null}
                {props.authorHidden ? <Badge tone="warning">Anonymized</Badge> : null}
                {props.blinded ? <Badge>Other ballots sealed until close</Badge> : null}
              </div>

              {props.round ? null : (
                <p className={styles.muted}>No council is open for deliberation.</p>
              )}

              {props.criteria.map((criterion) => (
                <div key={criterion.id} className={styles.criterion}>
                  <div className={styles.criterionHead}>
                    <span className={styles.criterionLabel}>{criterion.label}</span>
                    <span className={styles.criterionWeight}>×{criterion.weight}</span>
                  </div>
                  {criterion.description ? (
                    <span className={styles.criterionDescription}>{criterion.description}</span>
                  ) : null}
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
                </div>
              ))}

              {props.criteria.length === 0 ? (
                <p className={styles.muted}>
                  The magistrates have not inscribed measures for this council yet.
                </p>
              ) : null}

              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="reviewer-comment">
                  Comment
                </label>
                <Textarea
                  id="reviewer-comment"
                  rows={4}
                  value={comment}
                  placeholder="What should the council weigh before its verdict?"
                  onChange={(event) => setComment(event.target.value)}
                />
              </div>

              <div className={styles.scoreSummary}>
                <span className={styles.bigScore}>
                  {preview === null ? '—' : preview.toFixed(1)}
                </span>
                <span className={styles.scoreOutOf}>
                  out of 5 · {scoredCount}/{props.criteria.length} measures judged
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
                  Set judgment aside
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  loading={saving}
                  disabled={!props.round || !allScored}
                  onClick={() => save(true)}
                >
                  Cast judgment
                </Button>
              </div>
              {!allScored && props.criteria.length > 0 ? (
                <p className={styles.hint}>Judge every measure before casting your ballot.</p>
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
                  If you cannot judge this fairly, recuse yourself. It leaves your queue and the
                  organizer can reassign it.
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
              {props.peerCount} other {props.peerCount === 1 ? 'councillor is' : 'councillors are'}
              judging this petition. Their ballots stay sealed until the council closes.
            </p>
          ) : null}
        </div>
      </div>

      <Dialog
        open={recusalOpen}
        onOpenChange={setRecusalOpen}
        title="Withdraw from judgment on this petition"
        description={`${props.displayRef} — ${props.title}`}
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
            placeholder="A conflict of interest, prior allegiance, or simply no capacity."
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      </Dialog>
    </div>
  );
}
