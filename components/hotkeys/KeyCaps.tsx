import { Fragment } from 'react';
import { Kbd, cn } from '@/components/ui';
import { formatChordString } from '@/lib/hotkeys/match';
import type { Binding, Platform } from '@/lib/hotkeys/types';
import styles from './key-caps.module.css';

/**
 * The key caps for one binding, drawn from the binding itself.
 *
 * `display` wins where a literal rendering would be noise — nine caps for a 1–9 score range, or two
 * for one action with a synonym key. Connector words in a display list ("then", "or") are drawn as
 * plain text so they do not read as keys.
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
  const caps = binding.display ?? formatChordString(binding.chords[0] ?? '', platform);

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

const CONNECTORS = new Set(['then', 'or', '–']);

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
