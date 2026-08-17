import { chordSignature, matchesChord, parseChord } from './match';
import type { Binding, KeyDescriptor, ResolvedBinding, ScopeDef } from './types';

/**
 * Every keyboard shortcut in the organizer workspace, declared in one place.
 *
 * Adding a shortcut means adding a row here and a handler in the screen that owns it. The
 * shortcuts overlay reads these same rows, so a shortcut cannot ship undocumented and a
 * documented shortcut cannot quietly stop existing — the failure the old hand-written help dialog
 * had, where it listed two keys while twenty were live.
 *
 * Every row is one chord on the workspace modifier — ⌘⌃ on an Apple keyboard, Ctrl+Alt on a PC
 * one — with two deliberate exceptions: ⌘K for the palette, which is the convention everywhere,
 * and the two keys that are activation rather than shortcut, Escape and Enter. Nothing is a bare
 * letter and nothing is a two-key sequence. Bare letters meant a stray keystroke on the queue
 * could decide a submission; the `g`-then-letter sequences meant learning a grammar before a
 * destination. `hyper+s` is neither.
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

/**
 * The workspace's destinations, one chord each, mirroring the organizer sidebar in
 * `OrganizerShell`.
 *
 * Letters say what they mean wherever the platform left them free. Forms is the one that could not:
 * ⌘⌃F is "Enter Full Screen" on macOS, so it takes the shifted form rather than a letter that
 * means nothing. The last three are destinations the actions panel offers that the sidebar does
 * not, and they live here so that panel can draw its rows from this table instead of captioning
 * them by hand — a caption written beside a row is free to disagree with the key that fires it.
 */
const GOTO: Array<{ id: string; chord: string; label: string }> = [
  { id: 'goto-overview', chord: 'hyper+o', label: 'Go to overview' },
  { id: 'goto-updates', chord: 'hyper+u', label: 'Go to updates' },
  { id: 'goto-submissions', chord: 'hyper+s', label: 'Go to submissions' },
  { id: 'goto-agenda', chord: 'hyper+a', label: 'Go to agenda' },
  { id: 'goto-tasks', chord: 'hyper+t', label: 'Go to tasks' },
  { id: 'goto-forms', chord: 'hyper+shift+f', label: 'Go to forms' },
  { id: 'goto-comms', chord: 'hyper+c', label: 'Go to comms' },
  { id: 'goto-speakers', chord: 'hyper+p', label: 'Go to speakers' },
  { id: 'goto-new-event', chord: 'hyper+n', label: 'Go to the new event form' },
  /** `v` for "view it as a speaker does", and `e` because the programme is the event's own page. */
  { id: 'goto-portal', chord: 'hyper+v', label: 'Go to the speaker portal' },
  { id: 'goto-public', chord: 'hyper+e', label: 'Go to the public programme' },
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
    /**
     * `app/organizer/ActionsPanel.tsx` and the shortcuts overlay. Both used to be bare punctuation
     * — `.` and `?` — which is exactly the class of key this rebind exists to remove: `?` costs a
     * Shift on most layouts and neither survives a text field. On the modifier they are the same
     * two keys, one tier up.
     */
    {
      id: 'actions-panel',
      chords: ['hyper+.'],
      label: 'Open the actions panel',
      group: 'General',
    },
    {
      id: 'shortcuts-help',
      chords: ['hyper+/'],
      label: 'Show keyboard shortcuts',
      group: 'General',
    },
    ...GOTO.map(
      (entry): Binding => ({
        id: entry.id,
        chords: [entry.chord],
        label: entry.label,
        group: 'Navigate',
      }),
    ),
  ],
};

/**
 * `app/organizer/submissions/SubmissionQueue.tsx`.
 *
 * The verbs moved off bare letters: `a`/`d`/`w` decided submissions from any keystroke that was not
 * in a text field. They could not simply gain the modifier, either — `hyper+a` is the agenda from
 * anywhere and must stay that everywhere (see `noScreenShadowsAGlobal` in the tests), and ⌘⌃D is
 * macOS dictionary lookup. So accept is "yes" and decline is "reject", which is what the labels
 * already said. Shift keeps the meaning it had: propose it rather than do it.
 */
const SUBMISSIONS_QUEUE: ScopeDef = {
  id: SCOPES.submissionsQueue,
  title: 'Submission queue',
  bindings: [
    { id: 'next', chords: ['hyper+arrowdown'], label: 'Move to the next submission', group: 'Move' },
    {
      id: 'prev',
      chords: ['hyper+arrowup'],
      label: 'Move to the previous submission',
      group: 'Move',
    },
    {
      id: 'toggle',
      chords: ['hyper+x'],
      label: 'Select or deselect this submission',
      group: 'Move',
    },
    /**
     * Enter and Escape stay bare, here and everywhere. They are what a focused row and an open
     * panel already mean to a browser, they cannot be pressed by accident while typing, and putting
     * them behind the modifier would make this workspace the one place where dismissing something
     * takes two hands.
     */
    { id: 'open', chords: ['enter'], label: 'Open this submission', group: 'Move' },
    { id: 'clear', chords: ['escape'], label: 'Clear the selection', group: 'Move' },

    { id: 'accept', chords: ['hyper+y'], label: 'Accept', group: 'Decide' },
    { id: 'decline', chords: ['hyper+r'], label: 'Decline', group: 'Decide' },
    { id: 'waitlist', chords: ['hyper+w'], label: 'Waitlist', group: 'Decide' },

    {
      id: 'stage-accept',
      chords: ['hyper+shift+y'],
      label: 'Propose accepting',
      group: 'Propose',
    },
    {
      id: 'stage-decline',
      chords: ['hyper+shift+r'],
      label: 'Propose declining',
      group: 'Propose',
    },
    { id: 'stage-hold', chords: ['hyper+shift+h'], label: 'Propose holding', group: 'Propose' },
    {
      id: 'stage-clear',
      chords: ['hyper+shift+c'],
      label: 'Clear the proposal',
      group: 'Propose',
    },
  ],
};

/**
 * `app/organizer/submissions/[submissionId]/ReviewDetail.tsx`. The decision keys are the queue's,
 * because they are the same three decisions and a reviewer moves between the two screens all day.
 */
const SUBMISSION_DETAIL: ScopeDef = {
  id: SCOPES.submissionDetail,
  title: 'Reviewing a submission',
  bindings: [
    {
      id: 'score',
      chords: [
        'hyper+1',
        'hyper+2',
        'hyper+3',
        'hyper+4',
        'hyper+5',
        'hyper+6',
        'hyper+7',
        'hyper+8',
        'hyper+9',
      ],
      label: 'Score the active criterion and move to the next',
      group: 'Score',
      range: true,
    },
    {
      id: 'criterion-next',
      chords: ['hyper+arrowdown'],
      label: 'Move to the next criterion',
      group: 'Score',
    },
    {
      id: 'criterion-prev',
      chords: ['hyper+arrowup'],
      label: 'Move to the previous criterion',
      group: 'Score',
    },
    { id: 'save-draft', chords: ['hyper+shift+s'], label: 'Save a draft', group: 'Score' },
    /**
     * ⌘Enter, not the workspace modifier: it is what `submissions/new/NewSubmissionForm.tsx`
     * already submits on, and a review is a form being submitted. `allowInInput` because the last
     * thing a reviewer touches is the comment box they are typing in.
     */
    {
      id: 'submit',
      chords: ['mod+enter'],
      label: 'Complete the review',
      group: 'Score',
      allowInInput: true,
    },

    { id: 'next', chords: ['hyper+]'], label: 'Next submission', group: 'Move' },
    { id: 'prev', chords: ['hyper+['], label: 'Previous submission', group: 'Move' },
    { id: 'back', chords: ['hyper+backspace'], label: 'Back to the queue', group: 'Move' },

    { id: 'accept', chords: ['hyper+y'], label: 'Accept', group: 'Decide' },
    { id: 'waitlist', chords: ['hyper+w'], label: 'Waitlist', group: 'Decide' },
    { id: 'decline', chords: ['hyper+r'], label: 'Decline', group: 'Decide' },
  ],
};

/**
 * `app/organizer/agenda/AgendaBoard.tsx`.
 *
 * Moving a session and changing its time are deliberately absent from this table: they are served
 * by dnd-kit's `KeyboardSensor`, which drives the same drop path as the mouse, so conflict preview
 * and `placeSessionAction` behave identically either way. Arrow-key bindings here would be a second
 * way to move a session that could disagree with the first. The `lift` row documents the sensor's
 * keys without owning them — it has no chords, so it appears in the overlay and matches nothing.
 */
const AGENDA: ScopeDef = {
  id: SCOPES.agenda,
  title: 'Agenda',
  bindings: [
    {
      id: 'lift',
      chords: [],
      label: 'Lift a session, arrows to move it, space again to drop',
      group: 'Schedule',
      display: ['Space'],
    },
    { id: 'new-session', chords: ['hyper+shift+n'], label: 'New session', group: 'Schedule' },
    { id: 'publish-day', chords: ['hyper+shift+p'], label: 'Publish this day', group: 'Schedule' },
    { id: 'prev-day', chords: ['hyper+['], label: 'Previous day', group: 'Move' },
    { id: 'next-day', chords: ['hyper+]'], label: 'Next day', group: 'Move' },
    {
      id: 'view',
      chords: ['hyper+1', 'hyper+2', 'hyper+3', 'hyper+4', 'hyper+5', 'hyper+6'],
      label: 'Switch view: conference, list, room, track, conflicts, month',
      group: 'Move',
      range: true,
    },
  ],
};

const TASKS: ScopeDef = {
  id: SCOPES.tasks,
  title: 'Tasks',
  bindings: [
    { id: 'new-task', chords: ['hyper+shift+n'], label: 'New task', group: 'Build' },
    { id: 'view-people', chords: ['hyper+1'], label: 'Group by person', group: 'Move' },
    { id: 'view-tasks', chords: ['hyper+2'], label: 'Group by task', group: 'Move' },
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

/**
 * One binding by scope and id, for a surface that wants to draw the keys beside the button that
 * does the same thing. Reading the table is the point: a hand-written cap next to a row is a second
 * copy of the shortcut, and the copy is the one that goes stale.
 */
export function getBinding(scopeId: string, bindingId: string): Binding | undefined {
  return SCOPE_DEFS[scopeId]?.bindings.find((binding) => binding.id === bindingId);
}

/** Every scope, for the registry integrity tests. */
export function allScopes(): ScopeDef[] {
  return Object.values(SCOPE_DEFS);
}

/**
 * The keystrokes the shell claims everywhere, as canonical signatures.
 *
 * A screen may not take one. Shadowing works — an inner scope wins on a shared chord — but on a
 * screen full of decisions it would mean the key a user presses out of habit to reach the agenda
 * quietly accepts a submission instead. Navigation is the one family that has to mean the same
 * thing on every screen, so the test suite holds every other scope off these.
 */
export function globalSignatures(): Set<string> {
  return new Set(
    ORGANIZER_GLOBAL.bindings.flatMap((binding) =>
      binding.chords.map((chord) => chordSignature(parseChord(chord))),
    ),
  );
}

/**
 * The bindings actually live for a scope stack, innermost first.
 *
 * Two rules do the work. A `modal` scope truncates everything beneath it, so a confirmation dialog
 * silences the list behind it. And an inner scope shadows an outer one on the same chord, so a
 * screen can take a key the shell also wants without either table needing to know about the other.
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
      const signatures = binding.chords.map((chord) => chordSignature(parseChord(chord)));
      // A chordless binding documents a key some other machinery owns, so it is never shadowed and
      // never claims anything. Without the length check the `every` below would swallow it.
      if (signatures.length > 0 && signatures.every((signature) => claimed.has(signature))) continue;
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
 * `accept` lets the caller veto a candidate and keep looking. The provider uses it for two things
 * a pure table cannot know: whether a live handler is actually registered for the binding, and
 * whether the user is mid-sentence in a text field. Vetoing rather than stopping matters during a
 * route change, when an outgoing screen's scope can briefly outlive the component that answers for
 * it — without the fallthrough, its orphaned chords would swallow keys the incoming screen owns.
 */
export function findBinding(
  stack: readonly string[],
  event: KeyDescriptor,
  accept?: (candidate: ResolvedBinding) => boolean,
): BindingMatch | null {
  for (const entry of resolveBindings(stack)) {
    if (accept && !accept(entry)) continue;
    for (const chord of entry.binding.chords) {
      if (matchesChord(parseChord(chord), event)) return { ...entry, chord };
    }
  }
  return null;
}
