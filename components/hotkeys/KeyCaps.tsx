import { Fragment } from 'react';
import { Kbd, cn } from '@/components/ui';
import { formatChordString } from '@/lib/hotkeys/match';
import type { Binding, Platform } from '@/lib/hotkeys/types';
import styles from './key-caps.module.css';

/**
 * The key caps for one binding, drawn from the binding itself.
 *
 * `range` collapses a run of chords that differ only in their last key into `⌘ ⌃ 1 – 9`, and
 * `display` overrides the caps outright for a key this workspace documents but does not own. The
 * connector between the ends of a range is drawn as plain text so it does not read as a key.
 *
 * This lives beside the registry rather than inside the shortcuts overlay because the overlay is no
 * longer the only surface that shows keys: the actions panel captions every row with the chord that
 * fires it, and both have to agree with the table and with each other.
 */
export function KeyCaps({
  binding,
  platform,
  className,
  decorative = false,
}: {
  binding: Binding;
  platform: Platform;
  className?: string;
  /** For a control whose own text already names the action, so the caps are not read twice. */
  decorative?: boolean;
}) {
  const caps =
    binding.display ??
    (binding.range
      ? rangeCaps(binding, platform)
      : formatChordString(binding.chords[0] ?? '', platform));

  return (
    <span
      className={cn(styles.caps, className)}
      {...(decorative
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': describeCaps(caps) })}
    >
      {caps.map((cap, index) => (
        <Fragment key={`${cap}-${index}`}>
          {CONNECTORS.has(cap) ? (
            <span className={styles.connector}>{cap}</span>
          ) : (
            <Kbd>{cap}</Kbd>
          )}
        </Fragment>
      ))}
    </span>
  );
}

const CONNECTORS = new Set(['or', '–']);

/**
 * The ends of a chord range: the first chord in full, then the last chord's key alone. Built from
 * the chords rather than written out, so the same row reads `⌘ ⌃ 1 – 9` on a Mac and
 * `Ctrl Alt 1 – 9` everywhere else.
 */
function rangeCaps(binding: Binding, platform: Platform): string[] {
  const first = formatChordString(binding.chords[0] ?? '', platform);
  const last = formatChordString(binding.chords[binding.chords.length - 1] ?? '', platform);
  const end = last[last.length - 1];
  if (binding.chords.length < 2 || end === undefined) return first;
  return [...first, '–', end];
}

/**
 * Symbols a screen reader would either skip or mispronounce, said in words. Everything else is
 * already a word or a letter and is read correctly as it stands.
 */
const SPOKEN: Record<string, string> = {
  '⌘': 'Command',
  '⌥': 'Option',
  Ctrl: 'Control',
  Alt: 'Alt',
  '↵': 'Enter',
  '↑': 'Up arrow',
  '↓': 'Down arrow',
  '←': 'Left arrow',
  '→': 'Right arrow',
  '⌫': 'Backspace',
  '.': 'Period',
  '?': 'Question mark',
  '–': 'through',
  '[': 'Left bracket',
  ']': 'Right bracket',
};

function describeCaps(caps: string[]): string {
  return caps.map((cap) => SPOKEN[cap] ?? cap).join(' ');
}
