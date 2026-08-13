'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Select, useToast } from '@/components/ui';
import type { SpeakerWorkflowStatus } from '@/lib/services/participants';
import { setSpeakerStatusAction } from './actions';
import styles from './speakers.module.css';

export type StatusOption = { value: SpeakerWorkflowStatus; label: string };

const TONE: Record<SpeakerWorkflowStatus, 'info' | 'success' | 'warning' | 'neutral'> = {
  invited: 'info',
  confirmed: 'success',
  declined: 'warning',
  withdrawn: 'neutral',
};

function StatusBadge({
  status,
  options,
}: {
  status: SpeakerWorkflowStatus;
  options: StatusOption[];
}) {
  const label = options.find((option) => option.value === status)?.label ?? status;
  return <Badge tone={TONE[status]}>{label}</Badge>;
}

/**
 * `SPK-04`. Writes on change rather than behind a save button, because the roster is where an
 * organizer works through a list of people and a per-row save step is what makes them stop.
 */
export function SpeakerStatus({
  participantId,
  status,
  options,
  canManage,
  compact = false,
}: {
  participantId: string;
  status: SpeakerWorkflowStatus;
  options: StatusOption[];
  canManage: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(status);

  useEffect(() => setValue(status), [status]);

  if (!canManage) return <StatusBadge status={status} options={options} />;

  const save = (next: SpeakerWorkflowStatus) => {
    const previous = value;
    setValue(next);
    startTransition(async () => {
      const outcome = await setSpeakerStatusAction(participantId, next);
      if (!outcome.ok) {
        setValue(previous);
        toast({ title: outcome.message, tone: 'danger' });
        return;
      }
      router.refresh();
    });
  };

  return (
    <span className={styles.statusCell} onDoubleClick={(event) => event.stopPropagation()}>
      <Select
        selectSize={compact ? 'sm' : 'md'}
        value={value}
        disabled={pending}
        aria-label="Orator standing"
        onChange={(event) => save(event.target.value as SpeakerWorkflowStatus)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </span>
  );
}
