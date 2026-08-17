'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode, RefObject } from 'react';
import { isHyperDown, isTypingTarget } from '@/lib/hotkeys/match';
import { findBinding } from '@/lib/hotkeys/registry';
import type { HotkeyHandlers, Platform, ResolvedBinding } from '@/lib/hotkeys/types';
import { ShortcutsDialog } from './ShortcutsDialog';

/**
 * One keydown listener for the whole workspace.
 *
 * Before this, every screen that wanted a shortcut added its own `window.addEventListener` inside
 * a `useEffect` whose dependency array listed every value the handlers closed over — ten entries
 * on the submissions queue — so the listener was torn down and rebuilt on nearly every render, and
 * each screen re-derived "is the user typing" and "is a dialog open" for itself. Here the listener
 * is installed once and reads through refs, and both questions are answered in one place.
 */

/**
 * How long the workspace modifier must be held alone before the key caps appear.
 *
 * Long enough that firing a shortcut you already know — press, key, release, all inside a moment —
 * never flashes the workspace at you, short enough that holding the keys because you have forgotten
 * which letter it was feels like an answer rather than a wait.
 */
const HINT_DELAY_MS = 400;

/** Keys that are only ever a modifier, so pressing one does not count as "some other key is down". */
const MODIFIER_KEYS = new Set(['Meta', 'Control', 'Alt', 'Shift', 'OS', 'AltGraph']);

const EMPTY_HANDLERS: HotkeyHandlers = {};

interface Registration {
  scopeId: string;
  handlers: RefObject<HotkeyHandlers>;
}

interface HotkeyContextValue {
  /** Active scope ids, outermost first. */
  stack: string[];
  platform: Platform;
  openShortcuts: () => void;
  register: (registration: Registration) => () => void;
  /**
   * The workspace modifier is being held with nothing else. Surfaces that own a binding read this
   * to show the key that reaches them — see `components/hotkeys/HotkeyHint`.
   */
  hintsVisible: boolean;
}

/**
 * Outside a provider a screen has no shortcuts and nothing else changes.
 *
 * Throwing here would be the wrong trade. Screens that register bindings are rendered on their own
 * in tests, and the reviewer, portal, and CRM shells have not mounted a provider yet — none of that
 * is a bug worth taking a page down for, and a shortcut that quietly does not exist is exactly what
 * "this surface has no hotkeys" should look like.
 */
const NO_PROVIDER: HotkeyContextValue = {
  stack: [],
  platform: 'other',
  openShortcuts: () => undefined,
  register: () => () => undefined,
  hintsVisible: false,
};

const HotkeyContext = createContext<HotkeyContextValue>(NO_PROVIDER);

function describePlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const source = navigator.userAgent;
  return /Mac|iPhone|iPad|iPod/i.test(source) ? 'apple' : 'other';
}

export function HotkeyProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<string[]>([]);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  /**
   * Resolved after mount rather than during render: the server has no `navigator`, and picking ⌘
   * versus Ctrl during SSR would hydrate a key cap that disagrees with the markup.
   */
  const [platform, setPlatform] = useState<Platform>('other');
  const [hintsVisible, setHintsVisible] = useState(false);

  const registrations = useRef<Registration[]>([]);
  const stackRef = useRef<string[]>([]);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Read from inside the listener, which is installed once and must not close over state. */
  const hintsVisibleRef = useRef(false);
  hintsVisibleRef.current = hintsVisible;

  useEffect(() => setPlatform(describePlatform()), []);

  const syncStack = useCallback(() => {
    const next = registrations.current.map((entry) => entry.scopeId);
    stackRef.current = next;
    setStack(next);
  }, []);

  /**
   * Registration order is the stack order, so the most recently activated scope is innermost. That
   * is what a dialog opening over a list needs, and it stays correct without anyone having to
   * declare how deeply nested they are.
   */
  const register = useCallback(
    (registration: Registration) => {
      registrations.current = [...registrations.current, registration];
      syncStack();
      return () => {
        registrations.current = registrations.current.filter((entry) => entry !== registration);
        syncStack();
      };
    },
    [syncStack],
  );

  const handlerFor = useCallback((candidate: ResolvedBinding) => {
    // Last registration wins if two components ever claim the same scope id.
    for (let index = registrations.current.length - 1; index >= 0; index -= 1) {
      const entry = registrations.current[index];
      if (entry.scopeId !== candidate.scope.id) continue;
      const handler = entry.handlers.current[candidate.binding.id];
      if (handler) return handler;
    }
    return undefined;
  }, []);

  const hideHints = useCallback(() => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = null;
    setHintsVisible(false);
  }, []);

  const openShortcuts = useCallback(() => setShortcutsOpen(true), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Mid-composition keystrokes belong to the IME, not to us.
      if (event.isComposing || event.keyCode === 229) return;

      /**
       * Hints answer "which key gets me there", so they appear while the modifier waits alone and
       * leave the moment the sentence is finished — whether the key that finished it was a shortcut
       * or not. Modifier keydowns repeat on some platforms, so an already-running countdown is left
       * to run rather than restarted.
       */
      if (MODIFIER_KEYS.has(event.key)) {
        if (isHyperDown(event)) {
          if (!hintTimer.current && !hintsVisibleRef.current) {
            hintTimer.current = setTimeout(() => {
              hintTimer.current = null;
              setHintsVisible(true);
            }, HINT_DELAY_MS);
          }
        } else {
          hideHints();
        }
      } else {
        hideHints();
      }

      const target = event.target as HTMLElement | null;
      const typing = isTypingTarget(
        target ? { tagName: target.tagName, isContentEditable: target.isContentEditable } : null,
      );

      const accept = (candidate: ResolvedBinding) => {
        if (typing && !candidate.binding.allowInInput) return false;
        return handlerFor(candidate) !== undefined;
      };

      const match = findBinding(stackRef.current, event, accept);
      if (match) {
        event.preventDefault();
        handlerFor(match)?.({ key: event.key.toLowerCase(), chord: match.chord });
      }
    };

    /**
     * Releasing any part of the modifier ends the hint, and so does losing the window — which is
     * the case that matters, because ⌘⌃ held while switching apps would otherwise leave the caps
     * frozen on a workspace nobody is looking at, with no keyup ever arriving to clear them.
     */
    const onKeyUp = (event: KeyboardEvent) => {
      if (!isHyperDown(event)) hideHints();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', hideHints);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', hideHints);
      if (hintTimer.current) clearTimeout(hintTimer.current);
    };
  }, [handlerFor, hideHints]);

  const value = useMemo<HotkeyContextValue>(
    () => ({ stack, platform, openShortcuts, register, hintsVisible }),
    [stack, platform, openShortcuts, register, hintsVisible],
  );

  return (
    <HotkeyContext.Provider value={value}>
      {children}
      <ShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
        stack={stack}
        platform={platform}
      />
    </HotkeyContext.Provider>
  );
}

export function useHotkeyContext(): HotkeyContextValue {
  return useContext(HotkeyContext);
}

/**
 * Claim a scope and answer for its bindings while mounted.
 *
 * `handlers` is re-read from a ref on every render, so it can close over whatever it likes without
 * a dependency array and without reinstalling anything. `active: false` releases the scope
 * entirely — that is how a screen hands the keyboard to a dialog it opened.
 */
export function useHotkeys(
  scopeId: string,
  handlers: HotkeyHandlers,
  options: { active?: boolean } = {},
) {
  const { active = true } = options;
  const { register } = useHotkeyContext();
  const handlersRef = useRef<HotkeyHandlers>(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!active) return undefined;
    return register({ scopeId, handlers: handlersRef });
  }, [active, register, scopeId]);
}

/**
 * Claim a scope for its side effect only. Used by dialogs, whose scope carries no bindings and
 * exists to be `modal` — it stops resolution so the screen underneath stops responding.
 */
export function useHotkeyScope(scopeId: string, active = true) {
  useHotkeys(scopeId, EMPTY_HANDLERS, { active });
}
