'use client';

import { useState, useTransition } from 'react';
import { Sparkles } from 'lucide-react';
import { Button, Checkbox, Dialog, Textarea } from '@/components/ui';
import { formatZonedRange } from '@/lib/services/schedule';
import { AI_KEY_MISSING_NOTE } from '@/lib/ai/notice';
import { proposeAgendaAction, type WireProposal } from './ai-actions';
import styles from './agenda.module.css';

/**
 * `A-8`. The assistant proposes; the organizer disposes. Every row starts checked and any of them
 * can be dropped before applying — an assistant that wrote straight to the agenda would be a worse
 * product than no assistant, because the constraints it cannot see are the ones that matter.
 */

export function AiProposalDialog({
  open,
  modelConfigured,
  timeZone,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  modelConfigured: boolean;
  timeZone: string;
  onOpenChange: (open: boolean) => void;
  onApply: (
    placements: {
      targetId: string;
      kind: 'session' | 'submission';
      roomId: string;
      startsAt: string;
      endsAt: string;
    }[],
  ) => Promise<void>;
}) {
  const [guidance, setGuidance] = useState('');
  const [proposal, setProposal] = useState<WireProposal | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const request = () => {
    startTransition(async () => {
      const result = await proposeAgendaAction(guidance || null);
      setProposal(result);
      setChosen(new Set(result.placements.map((placement) => placement.targetId)));
    });
  };

  const apply = () => {
    if (!proposal) return;
    const selected = proposal.placements
      .filter((placement) => chosen.has(placement.targetId))
      .map((placement) => ({
        targetId: placement.targetId,
        kind: placement.kind,
        roomId: placement.roomId,
        startsAt: placement.startsAt,
        endsAt: placement.endsAt,
      }));
    startTransition(async () => {
      await onApply(selected);
      setProposal(null);
      onOpenChange(false);
    });
  };

  const toggle = (targetId: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(targetId)) next.delete(targetId);
      else next.add(targetId);
      return next;
    });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Draft an agenda"
      description="A suggested, conflict-free placement for everything still waiting for a slot. Nothing is saved until you apply it."
      size="lg"
      footer={
        <div className={styles.detailActions}>
          {proposal && proposal.placements.length > 0 ? (
            <Button variant="primary" onClick={apply} loading={pending}>
              Apply {chosen.size} placement{chosen.size === 1 ? '' : 's'}
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={request}
              loading={pending}
              iconLeft={<Sparkles size={14} />}
            >
              Suggest a schedule
            </Button>
          )}
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      }
    >
      <div className={styles.form}>
        {!modelConfigured && <p className={styles.proposalNote}>{AI_KEY_MISSING_NOTE}</p>}

        {!proposal && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="agenda-guidance">
              Anything it should know? (optional)
            </label>
            <Textarea
              id="agenda-guidance"
              rows={3}
              placeholder="Keep workshops in the afternoon; the keynote room is the largest."
              value={guidance}
              onChange={(fired) => setGuidance(fired.target.value)}
            />
          </div>
        )}

        {proposal?.message && <p className={styles.proposalNote}>{proposal.message}</p>}
        {proposal?.notes && <p className={styles.proposalNote}>{proposal.notes}</p>}

        {proposal && proposal.placements.length > 0 && (
          <div className={styles.proposalList}>
            {proposal.placements.map((placement) => (
              <div key={placement.targetId} className={styles.proposalRow}>
                <div className={styles.conflictBody}>
                  <label className={styles.cardTitle}>
                    <Checkbox
                      checked={chosen.has(placement.targetId)}
                      onChange={() => toggle(placement.targetId)}
                    />{' '}
                    {placement.title}
                  </label>
                  {placement.rationale && (
                    <span className={styles.proposalRationale}>{placement.rationale}</span>
                  )}
                </div>
                <span className={styles.listTime}>
                  {placement.dayKey}{' '}
                  {formatZonedRange(
                    new Date(placement.startsAt),
                    new Date(placement.endsAt),
                    timeZone,
                  )}{' '}
                  · {placement.roomName}
                </span>
              </div>
            ))}
          </div>
        )}

        {proposal && proposal.unplaced.length > 0 && (
          <div>
            <h3 className={styles.groupTitle}>Left for you</h3>
            {proposal.unplaced.map((row) => (
              <p key={row.title} className={styles.proposalRationale}>
                {row.title} — {row.reason}
              </p>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
