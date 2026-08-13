'use client';

import { useState } from 'react';
import { Check, Copy, TriangleAlert, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui';

type CopyState = 'idle' | 'copied' | 'failed';

const COPY_FEEDBACK: Record<CopyState, { label: string; Icon: LucideIcon }> = {
  idle: { label: 'Copy prompt', Icon: Copy },
  copied: { label: 'Prompt copied', Icon: Check },
  failed: { label: 'Copy failed', Icon: TriangleAlert },
};

export function CopyAgentPromptButton({ prompt }: { prompt: string }) {
  const [copyState, setCopyState] = useState<CopyState>('idle');

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  const { label, Icon } = COPY_FEEDBACK[copyState];

  return (
    <Button
      type="button"
      size="sm"
      iconLeft={<Icon size={15} aria-hidden="true" />}
      onClick={copyPrompt}
      aria-live="polite"
    >
      {label}
    </Button>
  );
}
