'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { cn } from '../cn';
import { Checkbox } from '../Checkbox';
import styles from './DataTable.module.css';

export interface DataTableColumn<T> {
  id: string;
  header: ReactNode;
  /** Any CSS width. Prefer a token expression; `1fr` is not valid on a <col>, use a percentage. */
  width?: string;
  align?: 'left' | 'center' | 'right';
  /** Renders the value in the mono face — for refs like SESS-4 and other identifiers. */
  mono?: boolean;
  /** Emphasises the cell as the row's primary label. */
  strong?: boolean;
  render: (row: T, rowIndex: number) => ReactNode;
}

export interface DataTableProps<T> {
  columns: Array<DataTableColumn<T>>;
  rows: T[];
  getRowId: (row: T, index: number) => string;
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

export function DataTable<T>({
  columns,
  rows,
  getRowId,
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
      <table className={styles.table}>
        {caption ? <caption className={styles.caption}>{caption}</caption> : null}
        <colgroup>
          {selectable ? <col style={{ width: 'var(--control-lg)' }} /> : null}
          {columns.map((column) => (
            <col key={column.id} style={column.width ? { width: column.width } : undefined} />
          ))}
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
