'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { GripVertical, UserPlus } from 'lucide-react';
import { Badge, Button, Card, CardBody, Select, useToast } from '@/components/ui';
import { moveProspectAction } from '../actions';
import type { CardWire, ColumnWire } from '../wire';
import styles from '../crm.module.css';

type Props = { columns: ColumnWire[] };

function ProspectCard({
  card,
  stages,
  onMove,
  disabled,
}: {
  card: CardWire;
  stages: Array<{ stage: string; label: string }>;
  onMove: (cardId: string, stage: string) => void;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.id,
  });

  return (
    <div ref={setNodeRef} className={styles.card} data-dragging={isDragging}>
      <div className={styles.cardGrip} {...listeners} {...attributes}>
        <span className={styles.row}>
          <GripVertical size={14} aria-hidden="true" />
          <Link href={`/crm/pipeline/${card.id}`} className={styles.cardName}>
            {card.name}
          </Link>
        </span>
        <span className={styles.cardMeta}>
          {[card.jobTitle, card.company].filter(Boolean).join(' · ') || card.email}
        </span>
      </div>
      <div className={styles.cardFooter}>
        {card.score !== null ? <Badge tone="accent">Score {card.score}</Badge> : <span />}
        <span className={styles.cardMeta}>{card.eventName ?? 'No event yet'}</span>
      </div>
      <Select
        selectSize="sm"
        value={card.stage}
        disabled={disabled}
        aria-label={`Move ${card.name} to another stage`}
        onChange={(entry) => onMove(card.id, entry.currentTarget.value)}
      >
        {stages.map((stage) => (
          <option key={stage.stage} value={stage.stage}>
            Move to {stage.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

function Column({
  column,
  stages,
  onMove,
  disabled,
}: {
  column: ColumnWire;
  stages: Array<{ stage: string; label: string }>;
  onMove: (cardId: string, stage: string) => void;
  disabled: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.stage });

  return (
    <section ref={setNodeRef} className={styles.column} data-over={isOver}>
      <header className={styles.columnHead}>
        <h2 className={styles.columnTitle}>{column.label}</h2>
        <Badge>{column.cards.length}</Badge>
      </header>
      {column.cards.length === 0 ? (
        <p className={styles.columnEmpty}>Empty</p>
      ) : (
        column.cards.map((card) => (
          <ProspectCard
            key={card.id}
            card={card}
            stages={stages}
            onMove={onMove}
            disabled={disabled}
          />
        ))
      )}
    </section>
  );
}

/**
 * Dragging is the fast path, but every card also carries a stage picker: a keyboard-only organizer
 * — and an automated browser walking the app — has to be able to advance a prospect without a
 * pointer gesture.
 */
export function PipelineBoard({ columns }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [board, setBoard] = useState(columns);
  const [dragging, setDragging] = useState<CardWire | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setBoard(columns), [columns]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const stages = useMemo(
    () => board.map((column) => ({ stage: column.stage, label: column.label })),
    [board],
  );
  const total = board.reduce((count, column) => count + column.cards.length, 0);

  const move = (cardId: string, stage: string) => {
    const from = board.find((column) => column.cards.some((card) => card.id === cardId));
    if (!from || from.stage === stage) return;
    const card = from.cards.find((entry) => entry.id === cardId);
    if (!card) return;

    setBoard((current) =>
      current.map((column) => {
        if (column.stage === from.stage) {
          return {
            ...column,
            cards: column.cards.filter((entry) => entry.id !== cardId),
          };
        }
        if (column.stage === stage) {
          return { ...column, cards: [...column.cards, { ...card, stage }] };
        }
        return column;
      }),
    );

    setError(null);
    startTransition(async () => {
      const result = await moveProspectAction({
        prospectId: cardId,
        stage: stage as never,
      });
      if (!result.ok) {
        setBoard(columns);
        setError(result.error);
        return;
      }
      toast({ title: `${card.name} moved`, tone: 'success' });
      router.refresh();
    });
  };

  const onDragStart = (entry: DragStartEvent) => {
    const id = String(entry.active.id);
    setDragging(board.flatMap((column) => column.cards).find((card) => card.id === id) ?? null);
  };

  const onDragEnd = (entry: DragEndEvent) => {
    setDragging(null);
    if (!entry.over) return;
    move(String(entry.active.id), String(entry.over.id));
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Organization</p>
          <h1 className={styles.title}>Sourcing pipeline</h1>
          <p className={styles.subtitle}>
            {total} prospects across {board.length} stages. Drag a card, or use the stage picker on
            it.
          </p>
        </div>
        <div className={styles.headActions}>
          <Button size="sm" variant="secondary" href="/crm" iconLeft={<UserPlus size={14} />}>
            Enroll from the directory
          </Button>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {total === 0 ? (
        <Card>
          <CardBody>
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>No one is being sourced yet</p>
              <p className={styles.emptyBody}>
                Open the directory, pick a contact and choose Enroll to put them on the board with a
                score and a rationale.
              </p>
              <Button variant="primary" href="/crm">
                Go to the directory
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div className={styles.board}>
            {board.map((column) => (
              <Column
                key={column.stage}
                column={column}
                stages={stages}
                onMove={move}
                disabled={pending}
              />
            ))}
          </div>
          <DragOverlay>
            {dragging ? (
              <div className={styles.card}>
                <span className={styles.cardName}>{dragging.name}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
