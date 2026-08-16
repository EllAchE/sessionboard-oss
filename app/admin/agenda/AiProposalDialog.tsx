'use client';

import { useState, useTransition } from 'react';
import { Sparkles } from 'lucide-react';
import { Button, Checkbox, Dialog, Input } from '@/components/ui';
import type { AgendaOptimizationWeights } from '@/lib/ai/agenda-optimizer';
import { formatZonedRange } from '@/lib/services/schedule';
import { proposeAgendaAction, type WireProposal } from './ai-actions';
import styles from './agenda.module.css';

const OPTIMIZATION_CONTROLS: Array<{
  key: keyof AgendaOptimizationWeights;
  label: string;
  hint: string;
}> = [
  {
    key: 'audienceOverlap',
    label: 'Audience overlap',
    hint: 'Separates talks with shared tracks, tags, personas, or subject matter.',
  },
  {
    key: 'expectedAttendance',
    label: 'Attendance forecast',
    hint: 'How strongly each talk’s expected audience should shape demand.',
  },
  {
    key: 'speakerPopularity',
    label: 'Speaker popularity',
    hint: 'How strongly a speaker’s 0–100 popularity score should raise demand.',
  },
  {
    key: 'roomFit',
    label: 'Room fit',
    hint: 'Matches estimated demand to room or stage capacity.',
  },
  {
    key: 'venueFlow',
    label: 'Venue flow',
    hint: 'Avoids moving related audiences between floors in adjacent slots.',
  },
  {
    key: 'scheduleCompactness',
    label: 'Schedule compactness',
    hint: 'Uses parallel rooms instead of spreading every talk across the day.',
  },
];

/**
 * `A-8`. The assistant proposes; the organizer disposes. Every row starts checked and any of them
 * can be dropped before applying — an assistant that wrote straight to the agenda would be a worse
 * product than no assistant, because the constraints it cannot see are the ones that matter.
 */

export function AiProposalDialog({
  open,
  timeZone,
  initialWeights,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  timeZone: string;
  initialWeights: AgendaOptimizationWeights;
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
  const [weights, setWeights] = useState(initialWeights);
  const [proposal, setProposal] = useState<WireProposal | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const request = () => {
    startTransition(async () => {
      const result = await proposeAgendaAction(weights);
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

  const setWeight = (key: keyof AgendaOptimizationWeights, value: string) =>
    setWeights((current) => ({
      ...current,
      [key]: Math.max(0, Math.min(100, Math.round(Number(value) || 0))),
    }));

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Build a smart agenda draft"
      description="A weighted, conflict-free placement for everything waiting for a slot. Review every suggestion before applying it."
      size="lg"
      footer={
        <div className={styles.detailActions}>
          {proposal && proposal.placements.length > 0 ? (
            <Button variant="primary" onClick={apply} loading={pending}>
              Apply {chosen.size} placement{chosen.size === 1 ? '' : 's'}
            </Button>
          ) : null}
          <Button
            variant={proposal?.placements.length ? undefined : 'primary'}
            onClick={request}
            loading={pending}
            iconLeft={<Sparkles size={14} />}
          >
            {proposal ? 'Rebuild draft' : 'Build draft'}
          </Button>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      }
    >
      <div className={styles.form}>
        <p className={styles.proposalNote}>
          Each weight runs from 0 (ignore it) to 100 (prioritize it). Building the draft saves these
          values as this event’s defaults.
        </p>
        <div className={styles.formRow}>
          {OPTIMIZATION_CONTROLS.map((control) => (
            <div className={styles.field} key={control.key}>
              <label className={styles.label} htmlFor={`agenda-weight-${control.key}`}>
                {control.label}
              </label>
              <Input
                id={`agenda-weight-${control.key}`}
                type="number"
                min={0}
                max={100}
                step={1}
                value={weights[control.key]}
                onChange={(event) => setWeight(control.key, event.target.value)}
              />
              <span className={styles.proposalRationale}>{control.hint}</span>
            </div>
          ))}
        </div>

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
