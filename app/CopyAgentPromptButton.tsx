'use client';

import { Code2, Sparkles } from 'lucide-react';
import { Button, useToast } from '@/components/ui';
import type { ButtonProps } from '@/components/ui';

/**
 * The button's icon, named rather than passed. Sparkles reads as "AI prompt", which is right for the
 * setup prompt and wrong for a code snippet, so a caller copying something else can say what it is —
 * but a server component cannot hand a component across this boundary, so it names one instead.
 */
const ICONS = {
  prompt: Sparkles,
  snippet: Code2,
} as const;

interface CopyAgentPromptButtonProps {
  prompt: string;
  label?: string;
  /** What landed on the clipboard, for the toast that reports it. */
  copiedSubject?: string;
  icon?: keyof typeof ICONS;
  size?: ButtonProps['size'];
  variant?: ButtonProps['variant'];
}

export function CopyAgentPromptButton({
  prompt,
  label,
  copiedSubject = 'Prompt',
  icon = 'prompt',
  size = 'sm',
  variant = 'secondary',
}: CopyAgentPromptButtonProps) {
  const { toast } = useToast();
  const Icon = ICONS[icon];

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      toast({ title: `${copiedSubject} copied`, tone: 'success', duration: 2500 });
    } catch {
      toast({ title: `Could not copy ${copiedSubject.toLowerCase()}`, tone: 'danger' });
    }
  };

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      iconLeft={<Icon size={15} aria-hidden="true" />}
      onClick={copyPrompt}
    >
      {label ?? 'Copy prompt'}
    </Button>
  );
}
