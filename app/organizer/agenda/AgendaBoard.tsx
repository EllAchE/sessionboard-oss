'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { AlertTriangle, CheckCircle2, Plus, Send, Sparkles } from 'lucide-react';
import { useHotkeys, useHotkeyScope } from '@/components/hotkeys/HotkeyProvider';
import { Badge, Button, useToast } from '@/components/ui';
import { SCOPES } from '@/lib/hotkeys/registry';
import {
  DEFAULT_SESSION_MINUTES,
  agendaDayKeys,
  applyPlacements,
  blockingConflicts,
  conflictsBySession,
  detectConflicts,
  durationMinutes,
  entriesForDay,
  formatDayLabel,
  formatZonedRange,
  isPlaced,
  placementFor,
  previewConflicts,
  provisionalEntry,
  publishCounts,
  summarizeConflicts,
  type ConflictPolicy,
  type Placement,
  type QueueItem,
  type ScheduleEntry,
} from '@/lib/services/schedule';
import {
  applyProposalAction,
  deleteSessionAction,
  placeSessionAction,
  publishAllAction,
  saveManualSessionAction,
  setConflictPolicyAction,
  setSessionStatusAction,
  unscheduleSessionAction,
  type ActionResult,
  type PlacementInput,
} from './actions';
import { AiProposalDialog } from './AiProposalDialog';
import type { AgendaData } from './data';
import {
  fromWire,
  unavailabilityFromWire,
  type NamedFormat,
  type NamedRoom,
  type NamedTrack,
  type WireEntry,
  type WireUnavailability,
} from './wire';
import { DayGrid, OrphanedNotice, UnscheduledRail, parseCellId, type DragPayload } from './Grid';
import { agendaCollisionDetection, cellCoordinateGetter } from './keyboardCoordinates';
import {
  SessionDialog,
  draftFor,
  draftForQueueItem,
  type SavePayload,
  type SessionDraft,
} from './SessionDialog';
import { ConflictsView, GroupedView, ListView, MonthView } from './Views';
import styles from './agenda.module.css';

/**
 * The agenda board. One `DndContext` covers the rail and every day grid on screen, so a card can
 * travel from "waiting for a slot" to a room column in one gesture and back again.
 *
 * `previewConflicts` runs on each hovered cell against the world as the drop would leave it. What
 * happens to a clash it finds is `AR-35`'s per-event `ConflictPolicy`: under `warn` — the default —
 * the drop lands, the save goes through and the clash is named in a toast and carried into the
 * conflicts view; under `block` the drop is refused before the round trip, and the server's
 * serialized re-check makes the same decision under the same lock.
 *
 * The board never decides that on its own: it reads `event.conflictPolicy` and calls the same
 * `blockingConflicts` the transaction does, so the preview and the write cannot disagree.
 *
 * Calendar mail is not this component's business. `actions.ts` routes every change through
 * `sendSessionInvites`, which owns `ics_sequence` and the `ics_uid` of an existing row.
 */

type ViewId = 'conference' | 'list' | 'room' | 'track' | 'conflicts' | 'month';

const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'conference', label: 'Conference' },
  { id: 'list', label: 'List' },
  { id: 'room', label: 'Room' },
  { id: 'track', label: 'Track' },
  { id: 'conflicts', label: 'Conflicts' },
  { id: 'month', label: 'Month' },
];

type Hover = { placement: Placement; additions: ScheduleEntry[]; dayKey: string };

/**
 * `AR-35`. The clashes a write actually committed, as the server saw them after the fact. Only the
 * two placement actions carry them; everything else returns `null`, hence the shape check rather
 * than a cast.
 */
function warningsOf(data: unknown): string[] {
  if (!data || typeof data !== 'object' || !('warnings' in data)) return [];
  const warnings = (data as { warnings: unknown }).warnings;
  return Array.isArray(warnings) ? warnings.filter((item): item is string => typeof item === 'string') : [];
}

type DragState = { payload: DragPayload; hover: Hover | null };

export function AgendaBoard({
  event,
  rooms,
  tracks,
  formats,
  entries: wireEntries,
  unavailability: wireUnavailability,
  queue: initialQueue,
  descriptions,
  modelConfigured,
  canManage,
}: {
  event: AgendaData['event'];
  rooms: NamedRoom[];
  tracks: NamedTrack[];
  formats: NamedFormat[];
  entries: WireEntry[];
  /** `AD-2`. Speaker-declared blackout windows, for the availability conflict kind. */
  unavailability: WireUnavailability[];
  queue: QueueItem[];
  descriptions: Record<string, string>;
  modelConfigured: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const timeZone = event.timezone;

  /**
   * Server state is the source of truth, but a drop has to land before the round trip or the block
   * snaps back under the cursor. Local state holds the optimistic result until `router.refresh()`
   * brings the real rows back.
   */
  const [entries, setEntries] = useState<ScheduleEntry[]>(() => fromWire(wireEntries));
  const [queue, setQueue] = useState<QueueItem[]>(initialQueue);
  useEffect(() => setEntries(fromWire(wireEntries)), [wireEntries]);
  useEffect(() => setQueue(initialQueue), [initialQueue]);

  const [view, setView] = useState<ViewId>('conference');
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dialog, setDialog] = useState<{
    draft: SessionDraft;
    status: ScheduleEntry['status'] | null;
  } | null>(null);
  const [proposalOpen, setProposalOpen] = useState(false);

  const dayKeys = useMemo(() => agendaDayKeys(event, entries), [event, entries]);
  const [dayKey, setDayKey] = useState<string>(() => dayKeys[0]);
  useEffect(() => {
    if (!dayKeys.includes(dayKey)) setDayKey(dayKeys[0]);
  }, [dayKeys, dayKey]);

  const labels = useMemo(
    () => ({
      rooms: Object.fromEntries(rooms.map((room) => [room.id, room.name])),
      tracks: Object.fromEntries(tracks.map((track) => [track.id, track.name])),
    }),
    [rooms, tracks],
  );

  /**
   * `AD-2`. Rehydrated once rather than on every detection pass: the drag path below runs the
   * detector on each hovered cell, and rebuilding a few dozen `Date`s per frame for a set that
   * never changes during a drag is pure waste.
   */
  const unavailability = useMemo(
    () => unavailabilityFromWire(wireUnavailability),
    [wireUnavailability],
  );

  const settled = useMemo(
    () => detectConflicts(entries, labels, unavailability),
    [entries, labels, unavailability],
  );

  /** What the board renders while a drag is in flight: the agenda as this drop would leave it. */
  const live = useMemo(() => {
    if (!drag?.hover) return settled;
    return previewConflicts(
      entries,
      [drag.hover.placement],
      labels,
      drag.hover.additions,
      unavailability,
    );
  }, [drag, entries, labels, settled, unavailability]);

  /**
   * `AR-35`. Optimistic so the switch reads as instant; the server action is the authority and
   * `router.refresh()` brings the stored value back.
   */
  const [policy, setPolicy] = useState<ConflictPolicy>(event.conflictPolicy);
  useEffect(() => setPolicy(event.conflictPolicy), [event.conflictPolicy]);

  /** Clashes the hovered drop would create, whatever their severity. Always shown. */
  const hovered = useMemo(() => {
    const sessionId = drag?.hover?.placement.sessionId;
    return sessionId ? live.filter((item) => item.sessionIds.includes(sessionId)) : [];
  }, [drag, live]);

  /** The subset of those the event's policy will actually refuse. Empty under `warn`. */
  const blocking = useMemo(() => blockingConflicts(hovered, policy), [hovered, policy]);

  const conflictIndex = useMemo(() => conflictsBySession(live), [live]);
  const summary = useMemo(() => summarizeConflicts(live), [live]);
  const counts = useMemo(() => publishCounts(entries), [entries]);

  const sensors = useSensors(
    // A block is both draggable and clickable; without a threshold, opening one is impossible.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    /**
     * The same block is also focusable, so Space lifts it and the arrows walk it across rooms and
     * time. Enter is left out of the sensor's keys deliberately: it stays the way into the session,
     * which is what it already did before a session could be lifted at all.
     */
    useSensor(KeyboardSensor, {
      coordinateGetter: cellCoordinateGetter,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  );

  // -------------------------------------------------------------------------
  // Server round trips
  // -------------------------------------------------------------------------

  /**
   * Every mutation goes through here. A failure is reported and the board resynced; a success that
   * committed clashes under a `warn` policy is reported too, because the whole point of allowing
   * the write is that the organizer is told what they now have — a silently accepted
   * double-booking is worse than a refused one.
   */
  const run = (title: string, action: () => Promise<ActionResult<unknown>>) => {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast({ title, description: result.error, tone: 'danger' });
      } else {
        const warnings = warningsOf(result.data);
        if (warnings.length > 0) {
          toast({
            title: 'Saved with a clash',
            description: warnings.join(' · '),
            tone: 'warning',
            duration: 9000,
            action: { label: 'Review', onClick: () => setView('conflicts') },
          });
        }
      }
      router.refresh();
    });
  };

  const changePolicy = (next: ConflictPolicy) => {
    setPolicy(next);
    startTransition(async () => {
      const result = await setConflictPolicyAction(next);
      if (!result.ok) {
        setPolicy(event.conflictPolicy);
        toast({ title: 'Could not change that setting', description: result.error, tone: 'danger' });
      }
      router.refresh();
    });
  };

  // -------------------------------------------------------------------------
  // Drag and drop
  // -------------------------------------------------------------------------

  function hoverFor(overId: string, payload: DragPayload): Hover | null {
    const cell = parseCellId(overId);
    if (!cell) return null;
    const targetDay = cell.dayKey ?? dayKey;

    if (payload.source === 'queue') {
      const item = payload.item;
      // A queue card that is already a session keeps its row and its id; a submission has no row
      // yet, so it is conflict-checked as a provisional entry under a placeholder id.
      const sessionId = item.kind === 'session' ? item.id : `pending:${item.id}`;
      const placement = placementFor(
        targetDay,
        cell.minute,
        cell.roomId,
        item.durationMinutes,
        timeZone,
        sessionId,
      );
      return {
        placement,
        additions: item.kind === 'submission' ? [provisionalEntry(item, placement)] : [],
        dayKey: targetDay,
      };
    }

    const entry = payload.entry;
    const minutes = isPlaced(entry)
      ? durationMinutes(entry.startsAt, entry.endsAt)
      : DEFAULT_SESSION_MINUTES;
    return {
      placement: placementFor(targetDay, cell.minute, cell.roomId, minutes, timeZone, entry.id),
      additions: [],
      dayKey: targetDay,
    };
  }

  const onDragStart = (fired: DragStartEvent) => {
    const payload = fired.active.data.current as DragPayload | undefined;
    if (payload) setDrag({ payload, hover: null });
  };

  const onDragOver = (fired: DragOverEvent) => {
    setDrag((current) => {
      if (!current) return current;
      const overId = fired.over ? String(fired.over.id) : null;
      const hover = overId ? hoverFor(overId, current.payload) : null;
      return { ...current, hover };
    });
  };

  const onDragEnd = (fired: DragEndEvent) => {
    const state = drag;
    setDrag(null);
    if (!state) return;

    const overId = fired.over ? String(fired.over.id) : null;
    if (!overId) return;

    if (!canManage) {
      toast({ title: 'Read only', description: 'You cannot change this agenda.', tone: 'warning' });
      return;
    }

    if (overId === 'rail') {
      if (state.payload.source !== 'grid') return;
      const entry = state.payload.entry;
      setEntries((current) =>
        current.map((row) =>
          row.id === entry.id ? { ...row, roomId: null, startsAt: null, endsAt: null } : row,
        ),
      );
      run('Could not unschedule that session', () => unscheduleSessionAction(entry.id));
      return;
    }

    const hover = hoverFor(overId, state.payload);
    if (!hover) return;

    /**
     * `AR-35`. Under `block` this is where the drop stops, before any round trip. Under `warn` the
     * drop proceeds and the clash becomes a named, reviewable warning instead of a dead end — the
     * server's `onWarn` will confirm what actually committed, so nothing is announced here that the
     * database might not agree with.
     */
    const conflicts = previewConflicts(
      entries,
      [hover.placement],
      labels,
      hover.additions,
      unavailability,
    ).filter((item) => item.sessionIds.includes(hover.placement.sessionId));
    const refused = blockingConflicts(conflicts, policy);
    if (refused.length > 0) {
      toast({
        title: 'Choose another slot',
        description: refused.map((item) => item.message).join(' · '),
        tone: 'danger',
        duration: 8000,
        action: { label: 'Allow clashes', onClick: () => changePolicy('warn') },
      });
      return;
    }

    const input: PlacementInput =
      state.payload.source === 'queue'
        ? {
            targetId: state.payload.item.id,
            kind: state.payload.item.kind,
            roomId: hover.placement.roomId,
            startsAt: hover.placement.startsAt.toISOString(),
            endsAt: hover.placement.endsAt.toISOString(),
          }
        : {
            targetId: state.payload.entry.id,
            kind: 'session',
            roomId: hover.placement.roomId,
            startsAt: hover.placement.startsAt.toISOString(),
            endsAt: hover.placement.endsAt.toISOString(),
          };

    if (input.kind === 'session') {
      setEntries((current) =>
        applyPlacements(current, [{ ...hover.placement, sessionId: input.targetId }]),
      );
    }
    if (state.payload.source === 'queue') {
      const item = state.payload.item;
      setQueue((current) =>
        current.filter((card) => !(card.kind === item.kind && card.id === item.id)),
      );
    }

    run('Could not move that session', () => placeSessionAction(input));
  };

  // -------------------------------------------------------------------------
  // Dialogs
  // -------------------------------------------------------------------------

  const openEntry = (entry: ScheduleEntry) =>
    setDialog({
      draft: {
        ...draftFor(entry, timeZone, dayKey),
        descriptionMarkdown: descriptions[entry.id] ?? '',
      },
      status: entry.status,
    });

  const openNew = () => setDialog({ draft: draftFor(null, timeZone, dayKey), status: null });

  const openQueued = (item: QueueItem) => {
    if (!canManage) {
      toast({ title: 'Read only', description: 'You cannot change this agenda.', tone: 'warning' });
      return;
    }
    if (item.kind === 'session') {
      const entry = entries.find((candidate) => candidate.id === item.id);
      if (entry) openEntry(entry);
      return;
    }
    setDialog({ draft: draftForQueueItem(item, dayKey), status: null });
  };

  const handleSave = async (payload: SavePayload) => {
    const result = await saveManualSessionAction(payload);
    if (!result.ok) {
      return result.error;
    }
    setDialog(null);
    router.refresh();
    return null;
  };

  const handleDelete = async (sessionId: string) => {
    const result = await deleteSessionAction(sessionId);
    if (!result.ok) {
      toast({ title: 'Could not delete that session', description: result.error, tone: 'danger' });
      return;
    }
    setDialog(null);
    router.refresh();
  };

  const handleUnschedule = async (sessionId: string) => {
    const result = await unscheduleSessionAction(sessionId);
    if (!result.ok) {
      toast({ title: 'Could not unschedule it', description: result.error, tone: 'danger' });
      return;
    }
    setDialog(null);
    router.refresh();
  };

  const handleStatus = async (
    sessionId: string,
    next: 'draft' | 'published' | 'cancelled',
  ) => {
    const result = await setSessionStatusAction(sessionId, next);
    if (!result.ok) {
      toast({ title: 'Could not change the status', description: result.error, tone: 'danger' });
      return;
    }
    setDialog(null);
    router.refresh();
  };

  const handleProposal = async (placements: PlacementInput[]) => {
    const result = await applyProposalAction(placements);
    if (!result.ok) {
      toast({ title: 'Could not apply the proposal', description: result.error, tone: 'danger' });
      return;
    }
    toast({
      title: `Applied ${result.data.applied} placement${result.data.applied === 1 ? '' : 's'}`,
      description:
        result.data.failed > 0 ? `${result.data.failed} could not be placed.` : undefined,
      tone: result.data.failed > 0 ? 'warning' : 'success',
    });
    router.refresh();
  };

  /** `A-6`. Draft is the working state; publishing is the deliberate act that reaches the public. */
  const draftsOnDay = useMemo(
    () =>
      entriesForDay(entries, dayKey, timeZone)
        .filter((entry) => entry.status === 'draft')
        .map((entry) => entry.id),
    [entries, dayKey, timeZone],
  );

  const publishDay = () =>
    run('Could not publish the day', async () => {
      const result = await publishAllAction(draftsOnDay);
      if (result.ok) {
        toast({
          title: `Published ${result.data.published} session${result.data.published === 1 ? '' : 's'}`,
          description:
            result.data.skipped > 0
              ? `${result.data.skipped} still needs a room and a time.`
              : 'Speakers with a published slot have been sent an invite.',
          tone: result.data.skipped > 0 ? 'warning' : 'success',
        });
      }
      return result;
    });

  // -------------------------------------------------------------------------
  // Keyboard
  // -------------------------------------------------------------------------

  const shiftDay = (step: 1 | -1) => {
    const index = dayKeys.indexOf(dayKey);
    const next = dayKeys[index + step];
    if (next) {
      setDayKey(next);
      setView('conference');
    }
  };

  /**
   * Screen-level keys, deliberately none of which move a session — that is the sensor's job above.
   * They stand down mid-lift so an arrow-key move cannot be interrupted by a day change underneath
   * it, and a read-only organizer gets the navigation keys without the ones that would write.
   */
  useHotkeys(
    SCOPES.agenda,
    {
      'new-session': () => {
        if (canManage) openNew();
      },
      'publish-day': () => {
        if (canManage && draftsOnDay.length > 0) publishDay();
      },
      'prev-day': () => shiftDay(-1),
      'next-day': () => shiftDay(1),
      view: (fired) => {
        const option = VIEWS[Number(fired.key) - 1];
        if (option) setView(option.id);
      },
    },
    { active: drag === null },
  );

  useHotkeyScope(SCOPES.dialog, dialog !== null || proposalOpen);

  const dialogConflicts = dialog?.draft.sessionId
    ? (conflictIndex.get(dialog.draft.sessionId) ?? [])
    : [];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{event.name}</p>
          <h1 className={styles.title}>Agenda</h1>
          <p className={styles.lede}>
            Drag accepted talks onto the grid. Conflicts are flagged. Times use {timeZone}.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Badge tone="neutral">{counts.draft} draft</Badge>
          <Badge tone="success">{counts.published} published</Badge>
          <Button iconLeft={<Plus size={14} />} onClick={openNew} disabled={!canManage}>
            Add session
          </Button>
          <Button
            iconLeft={<Sparkles size={14} />}
            onClick={() => setProposalOpen(true)}
            disabled={!canManage}
          >
            Draft with AI
          </Button>
          <Button
            variant="primary"
            iconLeft={<Send size={14} />}
            onClick={publishDay}
            loading={pending}
            disabled={!canManage || draftsOnDay.length === 0}
          >
            Publish day ({draftsOnDay.length})
          </Button>
        </div>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.viewSwitch}>
          {VIEWS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`${styles.viewButton} ${view === option.id ? styles.viewButtonActive : ''}`}
              aria-pressed={view === option.id}
              onClick={() => setView(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        {view === 'conference' && (
          <div className={styles.dayTabs}>
            {dayKeys.map((key) => (
              <button
                key={key}
                type="button"
                className={`${styles.dayTab} ${key === dayKey ? styles.dayTabActive : ''}`}
                aria-pressed={key === dayKey}
                onClick={() => setDayKey(key)}
              >
                {formatDayLabel(key, timeZone)}
              </button>
            ))}
          </div>
        )}
      </div>

      {blocking.length > 0 ? (
        <div className={`${styles.banner} ${styles.bannerError}`}>
          <AlertTriangle size={15} aria-hidden />
          <span>{blocking.map((item) => item.message).join(' · ')}</span>
          <span className={styles.bannerCounts}>Choose another slot</span>
        </div>
      ) : hovered.length > 0 ? (
        <div className={`${styles.banner} ${styles.bannerWarning}`}>
          <AlertTriangle size={15} aria-hidden />
          <span>{hovered.map((item) => item.message).join(' · ')}</span>
          <span className={styles.bannerCounts}>Drop to save it anyway</span>
        </div>
      ) : summary.total === 0 ? (
        <div className={`${styles.banner} ${styles.bannerClear}`}>
          <CheckCircle2 size={15} aria-hidden />
          <span>No conflicts.</span>
        </div>
      ) : (
        <div
          className={`${styles.banner} ${
            summary.room + summary.speaker > 0 ? styles.bannerError : styles.bannerWarning
          }`}
        >
          <AlertTriangle size={15} aria-hidden />
          <span>
            {summary.total} conflict{summary.total === 1 ? '' : 's'} on this agenda.
            {policy === 'warn' ? ' Saved as warnings — nothing is blocked.' : ''}
          </span>
          <span className={styles.bannerCounts}>
            <span>{summary.room} room</span>
            <span>{summary.speaker} speaker</span>
            <span>{summary.track} track</span>
            <button type="button" className={styles.viewButton} onClick={() => setView('conflicts')}>
              Review
            </button>
          </span>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={agendaCollisionDetection}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDrag(null)}
      >
        {view === 'conference' ? (
          <div className={styles.workspace}>
            <UnscheduledRail queue={queue} onSchedule={openQueued} />
            <div className={styles.boardMain}>
              <OrphanedNotice
                entries={entries}
                rooms={rooms}
                dayKey={dayKey}
                timeZone={timeZone}
              />
              <DayGrid
                entries={entries}
                rooms={rooms}
                dayKey={dayKey}
                timeZone={timeZone}
                conflictsBySessionId={conflictIndex}
                onOpen={openEntry}
              />
            </div>
          </div>
        ) : view === 'list' ? (
          <ListView
            entries={entries}
            timeZone={timeZone}
            labels={labels}
            conflictsBySessionId={conflictIndex}
            onOpen={openEntry}
          />
        ) : view === 'room' || view === 'track' ? (
          <GroupedView
            entries={entries}
            timeZone={timeZone}
            labels={labels}
            groupBy={view}
            rooms={rooms}
            tracks={tracks}
            conflictsBySessionId={conflictIndex}
            onOpen={openEntry}
          />
        ) : view === 'conflicts' ? (
          <ConflictsView
            conflicts={live}
            entries={entries}
            timeZone={timeZone}
            onOpen={openEntry}
            policy={policy}
            canManage={canManage}
            onPolicyChange={changePolicy}
            onUnschedule={(entry) => {
              setEntries((current) =>
                current.map((row) =>
                  row.id === entry.id ? { ...row, roomId: null, startsAt: null, endsAt: null } : row,
                ),
              );
              run('Could not unschedule that session', () => unscheduleSessionAction(entry.id));
            }}
          />
        ) : (
          <MonthView
            entries={entries}
            timeZone={timeZone}
            anchorKey={dayKey}
            onSelectDay={(selected) => {
              setDayKey(selected);
              setView('conference');
            }}
          />
        )}

        <DragOverlay dropAnimation={null}>
          {drag ? (
            <div
              className={`${styles.dragPreview} ${
                blocking.length > 0 ? styles.dragPreviewWarning : ''
              }`}
            >
              {drag.payload.source === 'queue' ? drag.payload.item.title : drag.payload.entry.title}
              {drag.hover && (
                <span className={styles.dragPreviewNote}>
                  {formatZonedRange(
                    drag.hover.placement.startsAt,
                    drag.hover.placement.endsAt,
                    timeZone,
                  )}
                  {drag.hover.placement.roomId
                    ? ` · ${labels.rooms[drag.hover.placement.roomId] ?? 'room'}`
                    : ''}
                </span>
              )}
              {blocking.length > 0 && (
                <span className={styles.dragPreviewNote}>{blocking[0].message}</span>
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <SessionDialog
        open={dialog !== null}
        draft={dialog?.draft ?? null}
        timeZone={timeZone}
        dayKeys={dayKeys}
        rooms={rooms}
        tracks={tracks}
        formats={formats}
        conflicts={dialogConflicts}
        status={dialog?.status ?? null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        onSave={handleSave}
        onDelete={handleDelete}
        onUnschedule={handleUnschedule}
        onStatusChange={handleStatus}
      />

      <AiProposalDialog
        open={proposalOpen}
        modelConfigured={modelConfigured}
        timeZone={timeZone}
        onOpenChange={setProposalOpen}
        onApply={handleProposal}
      />
    </div>
  );
}
