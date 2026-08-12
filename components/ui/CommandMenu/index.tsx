'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';
import { cn } from '../cn';
import { Kbd } from '../Kbd';
import styles from './CommandMenu.module.css';

export interface CommandMenuItem {
  id: string;
  label: string;
  group?: string;
  hint?: string;
  /** Extra terms the fuzzy filter should match on but that are never displayed. */
  keywords?: string[];
  icon?: ReactNode;
  shortcut?: string[];
  disabled?: boolean;
  onSelect: () => void;
}

export interface CommandMenuProps {
  items: CommandMenuItem[];
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  placeholder?: string;
  emptyMessage?: string;
  /** Binds the global ⌘K / Ctrl-K shortcut while mounted. */
  hotkey?: boolean;
  label?: string;
  className?: string;
}

interface FuzzyResult {
  score: number;
  indices: number[];
}

/**
 * Subsequence match. Consecutive runs and word-boundary hits score higher so that typing an
 * acronym ("ns" for "New Session") outranks an incidental letter sprinkle.
 */
function fuzzyMatch(haystack: string, needle: string): FuzzyResult | null {
  if (needle.length === 0) return { score: 0, indices: [] };
  const target = haystack.toLowerCase();
  const query = needle.toLowerCase();
  const indices: number[] = [];
  let score = 0;
  let cursor = 0;
  let previousIndex = -2;

  for (const char of query) {
    const found = target.indexOf(char, cursor);
    if (found === -1) return null;
    indices.push(found);
    if (found === previousIndex + 1) score += 8;
    if (found === 0) score += 12;
    else if (/[\s\-_/]/.test(target[found - 1] ?? '')) score += 6;
    score -= Math.min(found - cursor, 6);
    previousIndex = found;
    cursor = found + 1;
  }

  return { score, indices };
}

function scoreItem(item: CommandMenuItem, query: string): FuzzyResult | null {
  const direct = fuzzyMatch(item.label, query);
  if (direct) return direct;
  const keywordHit = (item.keywords ?? [])
    .concat(item.group ? [item.group] : [])
    .map((keyword) => fuzzyMatch(keyword, query))
    .filter((result): result is FuzzyResult => result !== null)
    .sort((a, b) => b.score - a.score)[0];
  return keywordHit ? { score: keywordHit.score - 20, indices: [] } : null;
}

function Highlight({ text, indices }: { text: string; indices: number[] }) {
  if (indices.length === 0) return <>{text}</>;
  const marked = new Set(indices);
  return (
    <>
      {Array.from(text).map((char, index) =>
        marked.has(index) ? (
          // eslint-disable-next-line react/no-array-index-key
          <span key={index} className={styles.match}>
            {char}
          </span>
        ) : (
          <span key={index}>{char}</span>
        ),
      )}
    </>
  );
}

export function CommandMenu({
  items,
  open,
  defaultOpen = false,
  onOpenChange,
  placeholder = 'Search commands…',
  emptyMessage = 'No matching commands.',
  hotkey = true,
  label = 'Command menu',
  className,
}: CommandMenuProps) {
  const baseId = useId();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [mounted, setMounted] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  const isOpen = open ?? uncontrolledOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (open === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange, open],
  );

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!hotkey) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen(!isOpen);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hotkey, isOpen, setOpen]);

  // Focus trap and restore: the input owns focus for the whole lifetime of the overlay.
  useEffect(() => {
    if (!isOpen) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    setQuery('');
    setActiveIndex(0);
    const raf = requestAnimationFrame(() => inputRef.current?.focus());

    const onFocusIn = (event: FocusEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        inputRef.current?.focus();
      }
    };
    document.addEventListener('focusin', onFocusIn);

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('focusin', onFocusIn);
      document.body.style.overflow = overflow;
      restoreRef.current?.focus?.();
    };
  }, [isOpen]);

  const results = useMemo(() => {
    const scored = items
      .map((item) => ({ item, match: scoreItem(item, query) }))
      .filter(
        (entry): entry is { item: CommandMenuItem; match: FuzzyResult } => entry.match !== null,
      );
    if (query.length > 0) scored.sort((a, b) => b.match.score - a.match.score);
    return scored;
  }, [items, query]);

  const groups = useMemo(() => {
    const ordered: Array<{ name: string; entries: typeof results }> = [];
    for (const entry of results) {
      const name = entry.item.group ?? 'Commands';
      const bucket = ordered.find((group) => group.name === name);
      if (bucket) bucket.entries.push(entry);
      else ordered.push({ name, entries: [entry] });
    }
    return ordered;
  }, [results]);

  const flat = useMemo(() => groups.flatMap((group) => group.entries), [groups]);
  const enabledIndices = useMemo(
    () => flat.map((entry, index) => (entry.item.disabled ? -1 : index)).filter((i) => i >= 0),
    [flat],
  );

  useEffect(() => {
    setActiveIndex(enabledIndices[0] ?? 0);
  }, [enabledIndices]);

  const move = (delta: number) => {
    if (enabledIndices.length === 0) return;
    const position = enabledIndices.indexOf(activeIndex);
    const nextPosition =
      (((position === -1 ? 0 : position) + delta) % enabledIndices.length + enabledIndices.length) %
      enabledIndices.length;
    setActiveIndex(enabledIndices[nextPosition] as number);
  };

  const run = (item: CommandMenuItem) => {
    if (item.disabled) return;
    setOpen(false);
    item.onSelect();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        setOpen(false);
        break;
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(enabledIndices[0] ?? 0);
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(enabledIndices[enabledIndices.length - 1] ?? 0);
        break;
      case 'Enter': {
        const entry = flat[activeIndex];
        if (!entry) break;
        event.preventDefault();
        run(entry.item);
        break;
      }
      case 'Tab':
        // Nothing outside the input is tabbable; swallowing Tab is what keeps focus trapped.
        event.preventDefault();
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    document.getElementById(`${baseId}-option-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, baseId, isOpen]);

  if (!mounted || !isOpen) return null;

  let cursor = -1;

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div
        ref={panelRef}
        className={cn(styles.panel, className)}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onKeyDown={handleKeyDown}
      >
        <div className={styles.inputRow}>
          <Search size={16} aria-hidden="true" />
          <input
            ref={inputRef}
            className={styles.input}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            role="combobox"
            aria-expanded="true"
            aria-controls={`${baseId}-list`}
            aria-activedescendant={
              flat.length > 0 ? `${baseId}-option-${activeIndex}` : undefined
            }
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
          />
          <Kbd>Esc</Kbd>
        </div>

        <div className={styles.list} id={`${baseId}-list`} role="listbox" aria-label={label}>
          {flat.length === 0 ? (
            <div className={styles.empty}>{emptyMessage}</div>
          ) : (
            groups.map((group) => (
              <div key={group.name} role="group" aria-label={group.name}>
                <div className={styles.groupLabel}>{group.name}</div>
                {group.entries.map((entry) => {
                  cursor += 1;
                  const index = cursor;
                  return (
                    <div
                      key={entry.item.id}
                      id={`${baseId}-option-${index}`}
                      className={styles.item}
                      role="option"
                      aria-selected={index === activeIndex}
                      aria-disabled={entry.item.disabled || undefined}
                      data-active={index === activeIndex}
                      onMouseMove={() => {
                        if (!entry.item.disabled) setActiveIndex(index);
                      }}
                      onClick={() => run(entry.item)}
                    >
                      {entry.item.icon ? (
                        <span className={styles.icon} aria-hidden="true">
                          {entry.item.icon}
                        </span>
                      ) : null}
                      <span className={styles.label}>
                        <Highlight text={entry.item.label} indices={entry.match.indices} />
                      </span>
                      {entry.item.hint ? (
                        <span className={styles.hint}>{entry.item.hint}</span>
                      ) : null}
                      {entry.item.shortcut ? (
                        <span className={styles.shortcut}>
                          {entry.item.shortcut.map((key) => (
                            <Kbd key={key}>{key}</Kbd>
                          ))}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className={styles.footer}>
          <span className={styles.footerHint}>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span className={styles.footerHint}>
            <Kbd>↵</Kbd> run
          </span>
          <span className={styles.footerHint}>
            <Kbd>esc</Kbd> dismiss
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
