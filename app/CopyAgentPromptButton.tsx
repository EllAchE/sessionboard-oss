'use client';

import { useState } from 'react';
import { Check, Sparkles, TriangleAlert, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui';
import type { ButtonProps } from '@/components/ui';

type CopyState = 'idle' | 'copied' | 'failed';

const COPY_FEEDBACK: Record<CopyState, { label: string; Icon: LucideIcon }> = {
  idle: { label: 'Copy prompt', Icon: Sparkles },
  copied: { label: 'Prompt copied', Icon: Check },
  failed: { label: 'Copy failed', Icon: TriangleAlert },
};

interface CopyAgentPromptButtonProps {
  prompt: string;
  label?: string;
  copiedLabel?: string;
  size?: ButtonProps['size'];
  variant?: ButtonProps['variant'];
}

export function CopyAgentPromptButton({
  prompt,
  label,
  copiedLabel,
  size = 'sm',
  variant = 'secondary',
}: CopyAgentPromptButtonProps) {
  const [copyState, setCopyState] = useState<CopyState>('idle');

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  const feedback = COPY_FEEDBACK[copyState];
  const visibleLabel =
    copyState === 'idle'
      ? (label ?? feedback.label)
      : copyState === 'copied'
        ? (copiedLabel ?? feedback.label)
        : feedback.label;
  const { Icon } = feedback;

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      iconLeft={<Icon size={15} aria-hidden="true" />}
      onClick={copyPrompt}
      aria-live="polite"
    >
      {visibleLabel}
    </Button>
  );
}
