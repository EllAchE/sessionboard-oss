'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Link2, TriangleAlert, type LucideIcon } from 'lucide-react';
import { Button, IconButton } from '@/components/ui';

/**
 * A committee argues about proposals by pasting links at each other. `/organizer/submissions/{id}`
 * already resolves, so the missing part was never the route — it was getting the absolute URL out
 * of the page without selecting the address bar, which is impossible from a row in a queue of forty.
 *
 * The origin is read at click time rather than rendered into the markup: the same submission is
 * reached over localhost, a preview host and the deployed host, and the link worth pasting is
 * always the one on the host the reader is already on.
 */

type CopyState = 'idle' | 'copied' | 'failed';

const FEEDBACK: Record<CopyState, { label: string; Icon: LucideIcon }> = {
  idle: { label: 'Copy link', Icon: Link2 },
  copied: { label: 'Link copied', Icon: Check },
  failed: { label: 'Copy failed', Icon: TriangleAlert },
};

/** Long enough to read, short enough that the button is ready before the next row is discussed. */
const RESET_MS = 2000;

export function CopyPermalinkButton({
  path,
  subject,
  compact = false,
}: {
  /** Root-relative, e.g. `/organizer/submissions/{id}`. */
  path: string;
  /** What the link points at, for the screen-reader label — a ref like `ABS-12`. */
  subject: string;
  compact?: boolean;
}) {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = async (event: React.MouseEvent) => {
    // The queue cell wraps this in a row link; copying is not navigating.
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(new URL(path, window.location.origin).toString());
      setState('copied');
    } catch {
      setState('failed');
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), RESET_MS);
  };

  const { label, Icon } = FEEDBACK[state];

  if (compact) {
    return (
      <IconButton
        size="xs"
        label={state === 'idle' ? `Copy link to ${subject}` : label}
        title={`Copy link to ${subject}`}
        onClick={copy}
      >
        <Icon size={13} aria-hidden="true" />
      </IconButton>
    );
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      iconLeft={<Icon size={15} aria-hidden="true" />}
      onClick={copy}
      aria-live="polite"
    >
      {label}
    </Button>
  );
}
