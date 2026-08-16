import { chordSignature, matchesChord, parseChord } from './match';
import type { Binding, KeyDescriptor, ResolvedBinding, ScopeDef } from './types';

/**
 * Every keyboard shortcut in the organizer workspace, declared in one place.
 *
 * Adding a shortcut means adding a row here and a handler in the screen that owns it. The
 * shortcuts overlay reads these same rows, so a shortcut cannot ship undocumented and a
 * documented shortcut cannot quietly stop existing — the failure the old hand-written help dialog
 * had, where it listed two keys while twenty were live.
 */

export const SCOPES = {
  /** The organizer shell. Live on every organizer screen. */
  organizerGlobal: 'organizer.global',
  submissionsQueue: 'organizer.submissions.queue',
  submissionDetail: 'organizer.submissions.detail',
  agenda: 'organizer.agenda',
  tasks: 'organizer.tasks',
  /** Claimed by any open dialog. Carries no bindings; its whole job is to be `modal`. */
  dialog: 'ui.dialog',
} as const;

export type ScopeId = (typeof SCOPES)[keyof typeof SCOPES];

/** Two-key navigation: `g` then a letter. Mirrors the organizer sidebar in `OrganizerShell`. */
const GOTO: Array<{ id: string; key: string; label: string }> = [
  { id: 'goto-overview', key: 'o', label: 'Go to overview' },
  { id: 'goto-submissions', key: 's', label: 'Go to submissions' },
  { id: 'goto-agenda', key: 'a', label: 'Go to agenda' },
  { id: 'goto-updates', key: 'u', label: 'Go to updates' },
  { id: 'goto-tasks', key: 't', label: 'Go to tasks' },
  { id: 'goto-forms', key: 'f', label: 'Go to forms' },
  { id: 'goto-comms', key: 'c', label: 'Go to comms' },
  { id: 'goto-speakers', key: 'p', label: 'Go to speakers' },
];

const ORGANIZER_GLOBAL: ScopeDef = {
  id: SCOPES.organizerGlobal,
  title: 'Anywhere',
  bindings: [
    {
      id: 'command-palette',
      chords: ['mod+k'],
      label: 'Open the command palette',
      group: 'General',
      allowInInput: true,
    },
    {
      id: 'shortcuts-help',
      chords: ['?'],
      label: 'Show keyboard shortcuts',
      group: 'General',
    },
    ...GOTO.map(
      (entry): Binding => ({
        id: entry.id,
        chords: [entry.key],
        prefix: 'g',
        label: entry.label,
        group: 'Navigate',
        display: ['G', 'then', entry.key.toUpperCase()],
      }),
    ),
  ],
};

/**
 * `app/organizer/submissions/SubmissionQueue.tsx`. These are the chords that screen already
 * shipped, moved verbatim — the migration onto this engine is meant to be invisible to anyone who
 * had them in their fingers.
 */
const SUBMISSIONS_QUEUE: ScopeDef = {
  id: SCOPES.submissionsQueue,
  title: 'Submission queue',
  bindings: [
    { id: 'next', chords: ['j'], label: 'Move to the next submission', group: 'Move' },
    { id: 'prev', chords: ['k'], label: 'Move to the previous submission', group: 'Move' },
    { id: 'toggle', chords: ['x'], label: 'Select or deselect this submission', group: 'Move' },
    {
      id: 'open',
      chords: ['o', 'enter'],
      label: 'Open this submission',
      group: 'Move',
      display: ['O', 'or', '↵'],
    },
    { id: 'clear', chords: ['escape'], label: 'Clear the selection', group: 'Move' },

    { id: 'accept', chords: ['a'], label: 'Accept', group: 'Decide' },
    { id: 'decline', chords: ['d'], label: 'Decline', group: 'Decide' },
    { id: 'waitlist', chords: ['w'], label: 'Waitlist', group: 'Decide' },

    { id: 'stage-accept', chords: ['shift+a'], label: 'Propose accepting', group: 'Propose' },
    { id: 'stage-decline', chords: ['shift+d'], label: 'Propose declining', group: 'Propose' },
    { id: 'stage-hold', chords: ['shift+h'], label: 'Propose holding', group: 'Propose' },
    { id: 'stage-clear', chords: ['shift+c'], label: 'Clear the proposal', group: 'Propose' },
  ],
};

/** `app/organizer/submissions/[submissionId]/ReviewDetail.tsx`, likewise moved verbatim. */
const SUBMISSION_DETAIL: ScopeDef = {
  id: SCOPES.submissionDetail,
  title: 'Reviewing a submission',
  bindings: [
    {
      id: 'score',
      chords: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
      label: 'Score the active criterion and move to the next',
      group: 'Score',
      display: ['1', '–', '9'],
    },
    {
      id: 'criterion-next',
      chords: ['arrowdown'],
      label: 'Move to the next criterion',
      group: 'Score',
    },
    {
      id: 'criterion-prev',
      chords: ['arrowup'],
      label: 'Move to the previous criterion',
      group: 'Score',
    },
    { id: 'save-draft', chords: ['s'], label: 'Save a draft', group: 'Score' },
    { id: 'submit', chords: ['c'], label: 'Complete the review', group: 'Score' },

    { id: 'next', chords: ['j'], label: 'Next submission', group: 'Move' },
    { id: 'prev', chords: ['k'], label: 'Previous submission', group: 'Move' },
    { id: 'back', chords: ['u'], label: 'Back to the queue', group: 'Move' },

    { id: 'accept', chords: ['a'], label: 'Accept', group: 'Decide' },
    { id: 'waitlist', chords: ['w'], label: 'Waitlist', group: 'Decide' },
    { id: 'decline', chords: ['d'], label: 'Decline', group: 'Decide' },
  ],
};

/**
 * `app/organizer/agenda/AgendaBoard.tsx`.
 *
 * Moving a session and changing its time are deliberately absent from this table: they are served
 * by dnd-kit's `KeyboardSensor`, which drives the same drop path as the mouse, so conflict
 * preview and `placeSessionAction` behave identically either way. Duplicating them here as
 * separate arrow-key bindings would create a second way to move a session that could disagree with
 * the first. The overlay documents the sensor's keys through `agenda-move` below, which is a
 * description rather than a live binding.
 */
const AGENDA: ScopeDef = {
  id: SCOPES.agenda,
  title: 'Agenda',
  bindings: [
    { id: 'new-session', chords: ['n'], label: 'New session', group: 'Build' },
    { id: 'unschedule', chords: ['u'], label: 'Unschedule the focused session', group: 'Build' },
    { id: 'publish-day', chords: ['p'], label: 'Publish this day', group: 'Build' },
    { id: 'prev-day', chords: ['['], label: 'Previous day', group: 'Move' },
    { id: 'next-day', chords: [']'], label: 'Next day', group: 'Move' },
    {
      id: 'view-1',
      chords: ['1'],
      label: 'Conference view',
      group: 'Move',
    },
    { id: 'view-2', chords: ['2'], label: 'Day view', group: 'Move' },
    { id: 'view-3', chords: ['3'], label: 'List view', group: 'Move' },
  ],
};

const TASKS: ScopeDef = {
  id: SCOPES.tasks,
  title: 'Tasks',
  bindings: [
    { id: 'new-task', chords: ['n'], label: 'New task', group: 'Build' },
    { id: 'view-people', chords: ['1'], label: 'Group by person', group: 'Move' },
    { id: 'view-tasks', chords: ['2'], label: 'Group by task', group: 'Move' },
  ],
};

/**
 * An open dialog. Escape is left to `components/ui/Dialog`, which already owns it along with the
 * focus trap; adding a competing Escape binding here would close two things at once.
 */
const DIALOG: ScopeDef = {
  id: SCOPES.dialog,
  title: 'This dialog',
  modal: true,
  bindings: [],
};

const SCOPE_DEFS: Record<string, ScopeDef> = {
  [SCOPES.organizerGlobal]: ORGANIZER_GLOBAL,
  [SCOPES.submissionsQueue]: SUBMISSIONS_QUEUE,
  [SCOPES.submissionDetail]: SUBMISSION_DETAIL,
  [SCOPES.agenda]: AGENDA,
  [SCOPES.tasks]: TASKS,
  [SCOPES.dialog]: DIALOG,
};

export function getScope(id: string): ScopeDef | undefined {
  return SCOPE_DEFS[id];
}

/** Every scope, for the registry integrity tests. */
export function allScopes(): ScopeDef[] {
  return Object.values(SCOPE_DEFS);
}

/** Distinguishes `g` then `s` from a bare `s` when checking for collisions. */
function signatureOf(binding: Binding, chord: string): string {
  const base = chordSignature(parseChord(chord));
  return binding.prefix ? `${binding.prefix}>${base}` : base;
}

/**
 * The bindings actually live for a scope stack, innermost first.
 *
 * Two rules do the work. A `modal` scope truncates everything beneath it, so a confirmation dialog
 * silences the list behind it. And an inner scope shadows an outer one on the same chord, so the
 * agenda's `u` ("unschedule") wins over nothing today but would win over a global `u` tomorrow
 * without either table needing to know about the other.
 */
export function resolveBindings(stack: readonly string[]): ResolvedBinding[] {
  const defs = stack
    .map((id) => SCOPE_DEFS[id])
    .filter((def): def is ScopeDef => def !== undefined);

  // Innermost first.
  const ordered = [...defs].reverse();
  const modalAt = ordered.findIndex((def) => def.modal);
  const visible = modalAt === -1 ? ordered : ordered.slice(0, modalAt + 1);

  const claimed = new Set<string>();
  const resolved: ResolvedBinding[] = [];

  for (const scope of visible) {
    for (const binding of scope.bindings) {
      const signatures = binding.chords.map((chord) => signatureOf(binding, chord));
      if (signatures.every((signature) => claimed.has(signature))) continue;
      for (const signature of signatures) claimed.add(signature);
      resolved.push({ scope, binding });
    }
  }

  return resolved;
}

export interface BindingMatch extends ResolvedBinding {
  /** The chord string that matched, so a range binding can report which digit fired. */
  chord: string;
}

/**
 * Which binding, if any, this keystroke fires.
 *
 * `pendingPrefix` is the armed leading key of a two-key sequence — `'g'` after the user pressed
 * `g`, `null` otherwise. A prefixed binding only fires while its prefix is armed, and an
 * unprefixed one only fires while none is, so `g` then `a` goes to the agenda without also
 * accepting the submission that `a` alone would.
 *
 * `accept` lets the caller veto a candidate and keep looking. The provider uses it for two things
 * a pure table cannot know: whether a live handler is actually registered for the binding, and
 * whether the user is mid-sentence in a text field. Vetoing rather than stopping matters during a
 * route change, when an outgoing screen's scope can briefly outlive the component that answers for
 * it — without the fallthrough, its orphaned chords would swallow keys the incoming screen owns.
 */
export function findBinding(
  stack: readonly string[],
  event: KeyDescriptor,
  pendingPrefix: string | null,
  accept?: (candidate: ResolvedBinding) => boolean,
): BindingMatch | null {
  for (const entry of resolveBindings(stack)) {
    const { binding } = entry;
    if ((binding.prefix ?? null) !== pendingPrefix) continue;
    if (accept && !accept(entry)) continue;
    for (const chord of binding.chords) {
      if (matchesChord(parseChord(chord), event)) return { ...entry, chord };
    }
  }
  return null;
}

/** Leading keys that should arm a sequence rather than being ignored, for the current stack. */
export function activePrefixes(stack: readonly string[]): Set<string> {
  const prefixes = new Set<string>();
  for (const { binding } of resolveBindings(stack)) {
    if (binding.prefix) prefixes.add(binding.prefix);
  }
  return prefixes;
}
