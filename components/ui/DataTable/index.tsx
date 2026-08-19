'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { cn } from '../cn';
import { Checkbox } from '../Checkbox';
import styles from './DataTable.module.css';

export type DataTableColumnSpace = 'compact' | 'standard' | 'wide';

export interface DataTableColumn<T> {
  id: string;
  header: ReactNode;
  /**
   * Preferred distribution at roomy widths. Use fixed values for bounded controls and percentages
   * for text; `1fr` is not valid on a `<col>`.
   */
  width?: string;
  /** Readable space to preserve before the table scrolls. Independent of the preferred width. */
  space?: DataTableColumnSpace;
  align?: 'left' | 'center' | 'right';
  /** Renders the value in the mono face — for refs like SESS-4 and other identifiers. */
  mono?: boolean;
  /** Emphasises the cell as the row's primary label. */
  strong?: boolean;
  /**
   * Cells truncate their own text with an ellipsis by default. Set `false` on columns that render
   * a control or a badge rather than a run of text: the ellipsis cannot truncate those, so it only
   * paints beside them and reads as text that was cut off.
   */
  truncate?: boolean;
  render: (row: T, rowIndex: number) => ReactNode;
}

export interface DataTableProps<T> {
  columns: Array<DataTableColumn<T>>;
  rows: T[];
  getRowId: (row: T, index: number) => string;
  /**
   * Prevents dense tables from crushing their columns before the grid scrolls horizontally.
   * Defaults to the sum of each column's semantic space, plus the selection control when present.
   */
  minWidth?: string;
  selectionMode?: 'none' | 'single' | 'multiple';
  selectedIds?: string[];
  defaultSelectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  activeIndex?: number;
  defaultActiveIndex?: number;
  onActiveIndexChange?: (index: number) => void;
  /** Enter on the active row, or a double click. */
  onRowActivate?: (row: T, index: number) => void;
  stickyHeader?: boolean;
  caption?: ReactNode;
  emptyState?: ReactNode;
  /** Accessible name for the grid when no visible caption is rendered. */
  label?: string;
  className?: string;
}

const PAGE_JUMP = 10;
const SELECTION_COLUMN_WIDTH_REM = 3;
const COLUMN_MIN_WIDTH_REM: Record<DataTableColumnSpace, number> = {
  compact: 6,
  standard: 8,
  wide: 12,
};

/**
 * `space` is the readable floor and `width` the preferred share, and the two used to be applied in
 * different places: the floors were summed into the table's `min-width`, while each `<col>` got its
 * declared `width` alone. So a column asking for `10%` of a table sitting at exactly that min-width
 * rendered at 100px against a 128px floor — narrow enough to lose its own heading, and never wide
 * enough to overflow the scroller, so no scrollbar appeared to say the rest was reachable. At
 * 1280px that quietly cut `SCORE` off the submissions table and truncated the reviewer queue's
 * header to `YOUR SCOR`.
 *
 * `max()` applies the floor where the width actually resolves, so a percentage can grow the column
 * on a roomy screen and never shrink it below what it takes to read.
 */
function columnWidth(column: { width?: string; space?: DataTableColumnSpace }): string | undefined {
  const floor = `${COLUMN_MIN_WIDTH_REM[column.space ?? 'standard']}rem`;
  if (!column.width) return undefined;
  return `max(${column.width}, ${floor})`;
}

/** Only used to compare a `px` preference against a `rem` floor. */
const ROOT_FONT_PX = 16;
/** The width below converges geometrically; this is a guard against a pathological column spec. */
const WIDTH_PASSES = 24;

/**
 * How wide the table has to be before every column clears its floor at once.
 *
 * Summing the floors understated it twice over. A column declared `140px` occupies more than its
 * 6rem `compact` floor. And a percentage column is worth its floor at narrow widths — `columnWidth`
 * guarantees that much — but *more* than its floor once the table is roomy, and under
 * `table-layout: fixed` that surplus comes out of the columns declaring no width at all. So the
 * table sat at the summed floors, the 16% column took a fifth more than its share of them, and the
 * title column it stole from ended up under the 12rem it had asked for.
 *
 * The width therefore depends on the percentages and the percentages depend on the width, so it is
 * iterated rather than summed: start at the floors and re-resolve until it stops moving. Converges
 * from below by a factor of the declared share each pass, so a handful of passes is exact to the
 * hundredth of a rem this rounds to.
 */
function requiredMinWidthRem(
  columns: Array<{ width?: string; space?: DataTableColumnSpace }>,
  selectionRem: number,
): number {
  /** Columns whose width the table's own width cannot change. */
  const fixed: number[] = [];
  const shares: Array<{ share: number; floor: number }> = [];

  for (const column of columns) {
    const floor = COLUMN_MIN_WIDTH_REM[column.space ?? 'standard'];
    const declared = column.width?.trim();
    const share = declared?.endsWith('%') ? Number.parseFloat(declared) / 100 : Number.NaN;
    if (Number.isFinite(share) && share > 0 && share < 1) {
      shares.push({ share, floor });
      continue;
    }
    // An `auto` column and one declared in `px` are both fixed here; only the floor differs.
    const rem = declared?.endsWith('px') ? Number.parseFloat(declared) / ROOT_FONT_PX : Number.NaN;
    fixed.push(Number.isFinite(rem) ? Math.max(floor, rem) : floor);
  }

  const base = fixed.reduce((total, rem) => total + rem, selectionRem);
  const atFloors = shares.reduce((total, column) => total + column.floor, base);
  // Shares totalling a whole table leave nothing to converge on; the floors are the honest answer.
  if (shares.reduce((total, column) => total + column.share, 0) >= 1) return atFloors;

  let width = atFloors;
  for (let pass = 0; pass < WIDTH_PASSES; pass += 1) {
    const next = shares.reduce(
      (total, column) => total + Math.max(column.floor, column.share * width),
      base,
    );
    if (next - width < 0.001) break;
    width = next;
  }

  return Math.ceil(width * 100) / 100;
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  minWidth,
  selectionMode = 'none',
  selectedIds,
  defaultSelectedIds,
  onSelectionChange,
  activeIndex,
  defaultActiveIndex = 0,
  onActiveIndexChange,
  onRowActivate,
  stickyHeader = true,
  caption,
  emptyState = 'Nothing here yet.',
  label,
  className,
}: DataTableProps<T>) {
  const baseId = useId();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());

  const [uncontrolledActive, setUncontrolledActive] = useState(defaultActiveIndex);
  const [uncontrolledSelection, setUncontrolledSelection] = useState<string[]>(
    defaultSelectedIds ?? [],
  );

  const active = activeIndex ?? uncontrolledActive;
  const selection = useMemo(
    () => new Set(selectedIds ?? uncontrolledSelection),
    [selectedIds, uncontrolledSelection],
  );

  const rowIds = useMemo(() => rows.map(getRowId), [rows, getRowId]);
  const selectable = selectionMode !== 'none';

  const commitActive = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(rows.length - 1, next));
      if (activeIndex === undefined) setUncontrolledActive(clamped);
      onActiveIndexChange?.(clamped);
    },
    [activeIndex, onActiveIndexChange, rows.length],
  );

  const commitSelection = useCallback(
    (next: string[]) => {
      if (selectedIds === undefined) setUncontrolledSelection(next);
      onSelectionChange?.(next);
    },
    [onSelectionChange, selectedIds],
  );

  const toggleRow = useCallback(
    (index: number) => {
      const id = rowIds[index];
      if (id === undefined) return;
      if (selectionMode === 'single') {
        commitSelection(selection.has(id) ? [] : [id]);
        return;
      }
      const next = new Set(selection);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      commitSelection(rowIds.filter((candidate) => next.has(candidate)));
    },
    [commitSelection, rowIds, selection, selectionMode],
  );

  const allSelected = rowIds.length > 0 && rowIds.every((id) => selection.has(id));
  const someSelected = rowIds.some((id) => selection.has(id));

  // Keep the keyboard cursor in view without stealing scroll from the rest of the page.
  useEffect(() => {
    if (rows.length === 0) return;
    const node = rowRefs.current.get(active);
    if (node && scrollerRef.current?.contains(document.activeElement)) {
      node.scrollIntoView({ block: 'nearest' });
    }
  }, [active, rows.length]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (rows.length === 0) return;
    const last = rows.length - 1;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        commitActive(active + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        commitActive(active - 1);
        break;
      case 'Home':
        event.preventDefault();
        commitActive(0);
        break;
      case 'End':
        event.preventDefault();
        commitActive(last);
        break;
      case 'PageDown':
        event.preventDefault();
        commitActive(active + PAGE_JUMP);
        break;
      case 'PageUp':
        event.preventDefault();
        commitActive(active - PAGE_JUMP);
        break;
      case ' ':
      case 'Spacebar':
        if (!selectable) break;
        event.preventDefault();
        toggleRow(active);
        break;
      case 'Enter': {
        const row = rows[active];
        if (!row) break;
        event.preventDefault();
        onRowActivate?.(row, active);
        break;
      }
      case 'a':
      case 'A':
        if (selectionMode !== 'multiple' || !(event.metaKey || event.ctrlKey)) break;
        event.preventDefault();
        commitSelection(allSelected ? [] : [...rowIds]);
        break;
      case 'Escape':
        if (!selectable || !someSelected) break;
        event.preventDefault();
        commitSelection([]);
        break;
      default:
        break;
    }
  };

  const activeRowId = rows.length > 0 ? `${baseId}-row-${active}` : undefined;
  const columnCount = columns.length + (selectable ? 1 : 0);
  const inferredMinWidth = `${requiredMinWidthRem(
    columns,
    selectable ? SELECTION_COLUMN_WIDTH_REM : 0,
  )}rem`;

  return (
    <div
      ref={scrollerRef}
      className={cn(styles.root, className)}
      role="grid"
      tabIndex={0}
      aria-label={label}
      aria-rowcount={rows.length}
      aria-multiselectable={selectionMode === 'multiple' || undefined}
      aria-activedescendant={activeRowId}
      onKeyDown={handleKeyDown}
    >
      <table className={styles.table} style={{ minWidth: minWidth ?? inferredMinWidth }}>
        {caption ? <caption className={styles.caption}>{caption}</caption> : null}
        <colgroup>
          {selectable ? <col style={{ width: 'var(--control-lg)' }} /> : null}
          {columns.map((column) => {
            const width = columnWidth(column);
            return <col key={column.id} style={width ? { width } : undefined} />;
          })}
        </colgroup>
        <thead className={cn(styles.head, stickyHeader && styles.sticky)}>
          <tr>
            {selectable ? (
              <th scope="col" className={styles.selectCell}>
                {selectionMode === 'multiple' ? (
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected && !allSelected}
                    onChange={() => commitSelection(allSelected ? [] : [...rowIds])}
                    aria-label={allSelected ? 'Clear selection' : 'Select all rows'}
                  />
                ) : null}
              </th>
            ) : null}
            {columns.map((column) => (
              <th key={column.id} scope="col" className={styles[column.align ?? 'left']}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className={styles.empty} colSpan={columnCount}>
                {emptyState}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => {
              const id = rowIds[index] as string;
              const isSelected = selection.has(id);
              return (
                <tr
                  key={id}
                  id={`${baseId}-row-${index}`}
                  ref={(node) => {
                    if (node) rowRefs.current.set(index, node);
                    else rowRefs.current.delete(index);
                  }}
                  className={styles.row}
                  data-active={index === active}
                  data-selected={isSelected}
                  aria-rowindex={index + 1}
                  aria-selected={selectable ? isSelected : undefined}
                  onClick={() => commitActive(index)}
                  onDoubleClick={() => onRowActivate?.(row, index)}
                >
                  {selectable ? (
                    <td className={styles.selectCell}>
                      <Checkbox
                        checked={isSelected}
                        onChange={() => toggleRow(index)}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`Select row ${index + 1}`}
                        tabIndex={-1}
                      />
                    </td>
                  ) : null}
                  {columns.map((column) => (
                    <td
                      key={column.id}
                      className={cn(
                        styles[column.align ?? 'left'],
                        column.mono && styles.mono,
                        column.strong && styles.strong,
                        column.truncate === false && styles.noTruncate,
                      )}
                    >
                      {column.render(row, index)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
