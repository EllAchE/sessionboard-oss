'use client';

import { useHotkeyContext } from './HotkeyProvider';
import { KeyCaps } from './KeyCaps';
import { getBinding } from '@/lib/hotkeys/registry';

/**
 * The standing "here are the keys" strip a screen keeps in view, built from the registry.
 *
 * The submissions queue and the review detail both carried one of these written out by hand, and
 * both were wrong before this change was even proposed: the queue advertised `o` to open a row when
 * the binding had been `Enter` for some time. A legend is a promise about what the keyboard does,
 * and the only way to keep it is to read the same table the keyboard reads.
 *
 * The words stay with the screen. `text` is the terse verb that fits a strip along the bottom of a
 * list ("move", "select"), where the registry's label is a full sentence written for the overlay.
 */
export function KeyLegend({
  scope,
  rows,
  className,
  rowClassName,
}: {
  scope: string;
  /** Binding ids and the words beside them. An id with no binding is skipped rather than drawn empty. */
  rows: Array<{ id: string; text: string }>;
  className?: string;
  rowClassName?: string;
}) {
  const { platform } = useHotkeyContext();

  return (
    <div className={className}>
      {rows.map((row) => {
        const binding = getBinding(scope, row.id);
        if (!binding) return null;
        return (
          <span className={rowClassName} key={row.id}>
            <KeyCaps binding={binding} platform={platform} /> {row.text}
          </span>
        );
      })}
    </div>
  );
}
