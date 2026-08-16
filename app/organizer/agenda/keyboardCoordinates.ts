import { closestCenter, pointerWithin } from '@dnd-kit/core';
import type { ClientRect, CollisionDetection, KeyboardCoordinateGetter } from '@dnd-kit/core';
import { parseCellId } from './Grid';

/**
 * Keyboard scheduling for the agenda grid.
 *
 * The board's rows are 18px and its columns are a room wide, so dnd-kit's default keyboard
 * coordinate getter — a flat 25px nudge per arrow press — would leave a session between two slots
 * and between two rooms. These two helpers make the keyboard land on the same droppable cells the
 * pointer does, which is the whole point: a keyboard move then runs through `onDragOver` and
 * `onDragEnd` exactly as a drag does, so conflict preview, the block policy, and
 * `placeSessionAction` all behave identically and there is only ever one way to move a session.
 */

/** Which way each arrow walks. Horizontal is rooms, vertical is time. */
const ARROWS: Record<string, { axis: 'x' | 'y'; sign: 1 | -1 }> = {
  ArrowRight: { axis: 'x', sign: 1 },
  ArrowLeft: { axis: 'x', sign: -1 },
  ArrowDown: { axis: 'y', sign: 1 },
  ArrowUp: { axis: 'y', sign: -1 },
};

function overlapsX(a: ClientRect, b: ClientRect): boolean {
  return a.left < b.right && b.left < a.right;
}

function overlapsY(a: ClientRect, b: ClientRect): boolean {
  return a.top < b.bottom && b.top < a.bottom;
}

/**
 * The next cell in the pressed direction: the closest one past the current edge that still lines up
 * on the other axis, with ties broken by how well it lines up. Moving right from a 14:00 block lands
 * on 14:00 in the next room, not on whatever cell happens to be nearest in a straight line.
 */
export const cellCoordinateGetter: KeyboardCoordinateGetter = (
  event,
  { currentCoordinates, context: { collisionRect, droppableContainers } },
) => {
  const arrow = ARROWS[event.code];
  if (!arrow || !collisionRect) return undefined;
  event.preventDefault();

  const cells: ClientRect[] = [];
  for (const container of droppableContainers.getEnabled()) {
    const rect = container.rect.current;
    // The unscheduled rail is a droppable too, and is not somewhere an arrow key should reach —
    // dropping a session out of the schedule is a decision, not a navigation step.
    if (!rect || !parseCellId(String(container.id))) continue;
    cells.push(rect);
  }
  if (cells.length === 0) return undefined;

  const forward = arrow.sign === 1;
  const horizontal = arrow.axis === 'x';
  const edge = horizontal ? collisionRect.left : collisionRect.top;

  let best: ClientRect | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestDrift = Number.POSITIVE_INFINITY;

  for (const cell of cells) {
    const along = horizontal ? cell.left : cell.top;
    const distance = forward ? along - edge : edge - along;
    // A half-slot of slack: cells that merely share an edge with the block are not "past" it.
    if (distance < 1) continue;
    if (!(horizontal ? overlapsY(collisionRect, cell) : overlapsX(collisionRect, cell))) continue;

    const drift = horizontal
      ? Math.abs(cell.top - collisionRect.top)
      : Math.abs(cell.left - collisionRect.left);
    if (distance < bestDistance || (distance === bestDistance && drift < bestDrift)) {
      best = cell;
      bestDistance = distance;
      bestDrift = drift;
    }
  }

  if (!best) return undefined;

  return {
    x: currentCoordinates.x + (best.left - collisionRect.left),
    y: currentCoordinates.y + (best.top - collisionRect.top),
  };
};

/**
 * `pointerWithin` needs a pointer, and a keyboard drag has none — left alone it reports no droppable
 * under a keyboard-moved session, so the drop would silently do nothing. Falling back to
 * `closestCenter` only when there are no pointer coordinates keeps mouse behaviour byte-identical,
 * including its refusal to drop outside the grid.
 */
export const agendaCollisionDetection: CollisionDetection = (args) =>
  args.pointerCoordinates ? pointerWithin(args) : closestCenter(args);
