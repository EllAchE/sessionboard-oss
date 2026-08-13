'use client';

import { useTransition } from 'react';
import { UserCheck } from 'lucide-react';
import { Button, IconButton, useToast } from '@/components/ui';
import { viewPortalAsAction } from './actions';

/**
 * `S-10`. On success the action redirects and this component is already gone, so the only thing it
 * has to handle is the failure — a participant whose account was removed, or a reviewer who reached
 * the button through a stale page.
 */
function useViewAs(participantId: string) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const go = () =>
    startTransition(async () => {
      const result = await viewPortalAsAction(participantId);
      if (result && !result.ok) toast({ title: result.message, tone: 'danger' });
    });
  return { pending, go };
}

export function ViewPortalAsButton({
  participantId,
  name,
}: {
  participantId: string;
  name: string;
}) {
  const { pending, go } = useViewAs(participantId);
  return (
    <Button size="sm" loading={pending} iconLeft={<UserCheck size={14} />} onClick={go}>
      View portal as {name.split(' ')[0]}
    </Button>
  );
}

export function ViewPortalAsRowButton({
  participantId,
  name,
}: {
  participantId: string;
  name: string;
}) {
  const { pending, go } = useViewAs(participantId);
  return (
    <IconButton
      label={`View the portal as ${name}`}
      size="xs"
      disabled={pending}
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        go();
      }}
    >
      <UserCheck size={14} />
    </IconButton>
  );
}
