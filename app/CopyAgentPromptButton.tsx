'use client';

import { Sparkles } from 'lucide-react';
import { Button, useToast } from '@/components/ui';
import type { ButtonProps } from '@/components/ui';

interface CopyAgentPromptButtonProps {
  prompt: string;
  label?: string;
  size?: ButtonProps['size'];
  variant?: ButtonProps['variant'];
}

export function CopyAgentPromptButton({
  prompt,
  label,
  size = 'sm',
  variant = 'secondary',
}: CopyAgentPromptButtonProps) {
  const { toast } = useToast();

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      toast({ title: 'Prompt copied', tone: 'success', duration: 2500 });
    } catch {
      toast({ title: 'Could not copy prompt', tone: 'danger' });
    }
  };

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      iconLeft={<Sparkles size={15} aria-hidden="true" />}
      onClick={copyPrompt}
    >
      {label ?? 'Copy prompt'}
    </Button>
  );
}
