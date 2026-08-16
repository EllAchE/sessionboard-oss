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
import { isTypingTarget } from '@/lib/hotkeys/match';
import { activePrefixes, findBinding } from '@/lib/hotkeys/registry';
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

/** How long an armed sequence prefix (`g`) waits for its second key before giving up. */
const PREFIX_TIMEOUT_MS = 1500;

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

  const registrations = useRef<Registration[]>([]);
  const stackRef = useRef<string[]>([]);
  const pendingPrefix = useRef<string | null>(null);
  const prefixTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const disarm = useCallback(() => {
    pendingPrefix.current = null;
    if (prefixTimer.current) clearTimeout(prefixTimer.current);
    prefixTimer.current = null;
  }, []);

  const openShortcuts = useCallback(() => setShortcutsOpen(true), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Mid-composition keystrokes belong to the IME, not to us.
      if (event.isComposing || event.keyCode === 229) return;

      const target = event.target as HTMLElement | null;
      const typing = isTypingTarget(
        target ? { tagName: target.tagName, isContentEditable: target.isContentEditable } : null,
      );

      const armed = pendingPrefix.current;
      if (armed) disarm();

      const accept = (candidate: ResolvedBinding) => {
        if (typing && !candidate.binding.allowInInput) return false;
        return handlerFor(candidate) !== undefined;
      };

      const match = findBinding(stackRef.current, event, armed, accept);
      if (match) {
        event.preventDefault();
        handlerFor(match)?.({ key: event.key.toLowerCase(), chord: match.chord });
        return;
      }

      // A sequence was armed and its second key meant nothing. Swallow it rather than letting it
      // fall through: after `g`, an `a` that misses should not accept a submission.
      if (armed) return;

      const bare = !event.metaKey && !event.ctrlKey && !event.altKey;
      if (!typing && bare && activePrefixes(stackRef.current).has(event.key.toLowerCase())) {
        event.preventDefault();
        pendingPrefix.current = event.key.toLowerCase();
        prefixTimer.current = setTimeout(disarm, PREFIX_TIMEOUT_MS);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      disarm();
    };
  }, [disarm, handlerFor]);

  const value = useMemo<HotkeyContextValue>(
    () => ({ stack, platform, openShortcuts, register }),
    [stack, platform, openShortcuts, register],
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
