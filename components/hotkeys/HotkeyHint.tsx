'use client';

import { Kbd, cn } from '@/components/ui';
import { formatChordKey, parseChord } from '@/lib/hotkeys/match';
import { getBinding } from '@/lib/hotkeys/registry';
import { useHotkeyContext } from './HotkeyProvider';
import styles from './key-hint.module.css';

/**
 * The key that reaches this control, shown on the control itself while the workspace modifier is
 * held.
 *
 * A shortcut nobody can find is a shortcut nobody has. The overlay lists them, but a list is
 * something you go and read; this is the same information arriving where the question is asked —
 * hold ⌘⌃, look at the sidebar, see that Agenda is `A`. It draws only the key, never the modifier
 * (see `formatChordKey`), because the modifier is what is being held to make it appear.
 *
 * Always `aria-hidden`. The control it sits on carries `aria-keyshortcuts`, which is the same fact
 * in the form a screen reader can act on and does not depend on holding a key to be discovered.
 */
export function HotkeyHint({
  scope,
  binding: bindingId,
  chord,
  className,
}: {
  /** Scope and binding id, for the usual case of hinting a control that a registry row fires. */
  scope?: string;
  binding?: string;
  /**
   * A chord string instead, for a control that owns one key of a range — each agenda view tab has
   * its own digit inside a single `view` binding.
   */
  chord?: string;
  className?: string;
}) {
  const { hintsVisible, platform } = useHotkeyContext();
  if (!hintsVisible) return null;

  const source =
    chord ?? (scope && bindingId ? getBinding(scope, bindingId)?.chords[0] : undefined);
  if (!source) return null;

  return (
    <span className={cn(styles.hint, className)} aria-hidden="true">
      {formatChordKey(parseChord(source), platform).map((cap, index) => (
        <Kbd className={styles.cap} key={`${cap}-${index}`}>
          {cap}
        </Kbd>
      ))}
    </span>
  );
}
