'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { AlertTriangle, CheckCircle2, Plus, Send, Sparkles } from 'lucide-react';
import { Badge, Button, useToast } from '@/components/ui';
import {
  DEFAULT_SESSION_MINUTES,
  agendaDayKeys,
  applyPlacements,
  conflictKey,
  conflictsBySession,
  detectConflicts,
  durationMinutes,
  entriesForDay,
  formatDayLabel,
  formatZonedRange,
  isPlaced,
  pad2,
  placementFor,
  previewConflicts,
  provisionalEntry,
  publishCounts,
  summarizeConflicts,
  type Conflict,
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
  setSessionStatusAction,
  unscheduleSessionAction,
  type ActionResult,
  type PlacementInput,
} from './actions';
import { AiProposalDialog } from './AiProposalDialog';
import type { AgendaData } from './data';
import { fromWire, type NamedFormat, type NamedRoom, type NamedTrack, type WireEntry } from './wire';
import { DayGrid, OrphanedNotice, UnscheduledRail, parseCellId, type DragPayload } from './Grid';
import { SessionDialog, draftFor, type SavePayload, type SessionDraft } from './SessionDialog';
import { ConflictsView, GroupedView, ListView, MonthView } from './Views';
import styles from './agenda.module.css';

/**
 * The agenda board. One `DndContext` covers the rail and every day grid on screen, so a card can
 * travel from "waiting for a slot" to a room column in one gesture and back again.
 *
 * The rule that shapes this component: **conflicts are computed live and never block a drop.**
 * `previewConflicts` runs on each hovered cell against the world as it would be, and the difference
 * against the current conflicts is what the organizer sees under the cursor. They drop anyway if
 * they mean to — the schedule they are holding in their head beats the one we can infer.
 *
 * Calendar mail is not this component's business. `actions.ts` routes every change through
 * `sendSessionInvites`, which owns `ics_sequence` and the `ics_uid` of an existing row.
 */

type ViewId = 'day' | 'week' | 'list' | 'room' | 'track' | 'conflicts' | 'month';

const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'list', label: 'List' },
  { id: 'room', label: 'Room' },
  { id: 'track', label: 'Track' },
  { id: 'conflicts', label: 'Conflicts' },
  { id: 'month', label: 'Month' },
];

const GRID_VIEWS: ViewId[] = ['day', 'week'];

/** The Monday–Sunday window `anchor` falls in, narrowed to days the agenda actually has. */
function weekDayKeys(anchor: string, available: string[]): string[] {
  const [year, month, day] = anchor.split('-').map(Number);
  const at = Date.UTC(year, (month ?? 1) - 1, day ?? 1);
  const monday = at - ((new Date(at).getUTCDay() + 6) % 7) * 86_400_000;
  const window = new Set(
    Array.from({ length: 7 }, (_, index) => {
      const cell = new Date(monday + index * 86_400_000);
      return `${cell.getUTCFullYear()}-${pad2(cell.getUTCMonth() + 1)}-${pad2(cell.getUTCDate())}`;
    }),
  );
  const inWeek = available.filter((key) => window.has(key));
  return inWeek.length > 0 ? inWeek : [anchor];
}

type Hover = { placement: Placement; additions: ScheduleEntry[]; dayKey: string };

type DragState = { payload: DragPayload; hover: Hover | null };

export function AgendaBoard({
  event,
  rooms,
  tracks,
  formats,
  entries: wireEntries,
  queue: initialQueue,
  descriptions,
  assistantEnabled,
  canManage,
}: {
  event: AgendaData['event'];
  rooms: NamedRoom[];
  tracks: NamedTrack[];
  formats: NamedFormat[];
  entries: WireEntry[];
  queue: QueueItem[];
  descriptions: Record<string, string>;
  assistantEnabled: boolean;
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

  const [view, setView] = useState<ViewId>('day');
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

  const settled = useMemo(() => detectConflicts(entries, labels), [entries, labels]);
  const settledKeys = useMemo(() => new Set(settled.map(conflictKey)), [settled]);

  /** What the board renders while a drag is in flight: the agenda as this drop would leave it. */
  const live = useMemo(() => {
    if (!drag?.hover) return settled;
    return previewConflicts(entries, [drag.hover.placement], labels, drag.hover.additions);
  }, [drag, entries, labels, settled]);

  const introduced = useMemo(
    () => (drag?.hover ? live.filter((conflict) => !settledKeys.has(conflictKey(conflict))) : []),
    [drag, live, settledKeys],
  );

  const conflictIndex = useMemo(() => conflictsBySession(live), [live]);
  const summary = useMemo(() => summarizeConflicts(live), [live]);
  const counts = useMemo(() => publishCounts(entries), [entries]);

  const sensors = useSensors(
    // A block is both draggable and clickable; without a threshold, opening one is impossible.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  // -------------------------------------------------------------------------
  // Server round trips
  // -------------------------------------------------------------------------

  const run = (title: string, action: () => Promise<ActionResult<unknown>>) => {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) toast({ title, description: result.error, tone: 'danger' });
      router.refresh();
    });
  };

  const warnAbout = (conflicts: Conflict[]) => {
    if (conflicts.length === 0) return;
    const worst = conflicts.some((conflict) => conflict.severity === 'error');
    toast({
      title: worst ? 'Placed, with a clash' : 'Placed, with an overlap',
      description: conflicts.map((conflict) => conflict.message).join(' · '),
      tone: worst ? 'danger' : 'warning',
      duration: 8000,
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

    // The drop always lands. The warning is the product: the organizer is told, not stopped.
    warnAbout(
      previewConflicts(entries, [hover.placement], labels, hover.additions).filter(
        (conflict) => !settledKeys.has(conflictKey(conflict)),
      ),
    );

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

  const handleSave = async (payload: SavePayload) => {
    const result = await saveManualSessionAction(payload);
    if (!result.ok) {
      toast({ title: 'Could not save that session', description: result.error, tone: 'danger' });
      return;
    }
    setDialog(null);
    router.refresh();
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

  const visibleDays = view === 'week' ? weekDayKeys(dayKey, dayKeys) : [dayKey];
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
            Drag an accepted talk from the rail onto a room and a time. Clashes are flagged as you
            move, never blocked — times shown in {timeZone}.
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
        {GRID_VIEWS.includes(view) && (
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

      {introduced.length > 0 ? (
        <div className={`${styles.banner} ${styles.bannerError}`}>
          <AlertTriangle size={15} aria-hidden />
          <span>{introduced.map((conflict) => conflict.message).join(' · ')}</span>
          <span className={styles.bannerCounts}>Drop anyway if you mean to</span>
        </div>
      ) : summary.total === 0 ? (
        <div className={`${styles.banner} ${styles.bannerClear}`}>
          <CheckCircle2 size={15} aria-hidden />
          <span>No room, track or speaker clashes. Back-to-back sessions are not clashes.</span>
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
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDrag(null)}
      >
        {GRID_VIEWS.includes(view) ? (
          <div className={styles.workspace}>
            <UnscheduledRail queue={queue} />
            <div className={styles.boardMain}>
              <OrphanedNotice
                entries={entries}
                rooms={rooms}
                dayKey={dayKey}
                timeZone={timeZone}
              />
              {visibleDays.map((key) => (
                <div key={key} className={styles.weekDay}>
                  {view === 'week' && (
                    <h3 className={styles.weekDayTitle}>{formatDayLabel(key, timeZone)}</h3>
                  )}
                  <DayGrid
                    entries={entries}
                    rooms={rooms}
                    dayKey={key}
                    timeZone={timeZone}
                    conflictsBySessionId={conflictIndex}
                    onOpen={openEntry}
                  />
                </div>
              ))}
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
          />
        ) : (
          <MonthView
            entries={entries}
            timeZone={timeZone}
            anchorKey={dayKey}
            onSelectDay={(selected) => {
              setDayKey(selected);
              setView('day');
            }}
          />
        )}

        <DragOverlay dropAnimation={null}>
          {drag ? (
            <div
              className={`${styles.dragPreview} ${
                introduced.length > 0 ? styles.dragPreviewWarning : ''
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
              {introduced.length > 0 && (
                <span className={styles.dragPreviewNote}>{introduced[0].message}</span>
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
        enabled={assistantEnabled}
        timeZone={timeZone}
        onOpenChange={setProposalOpen}
        onApply={handleProposal}
      />
    </div>
  );
}
