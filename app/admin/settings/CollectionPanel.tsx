'use client';

import { useEffect, useState, useTransition } from 'react';
import type { KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  DataTable,
  Dialog,
  IconButton,
  Input,
  Select,
  useToast,
  type DataTableColumn,
} from '@/components/ui';
import { COLOR_TOKENS } from './palette';
import { createRowAction, removeRowAction, reorderRowsAction, updateRowAction } from './actions';
import type { ColumnSpec, EntityRow, EntitySpec } from './types';
import styles from './settings.module.css';

/**
 * One editable table, six taxonomies. Edits commit on blur rather than behind a per-row dialog:
 * the organizer setting a conference up is renaming eight tracks in a row, and a modal each time
 * turns that into thirty clicks.
 *
 * `DataTable` owns arrow-key row navigation, so every control inside a cell stops the keydown
 * before it gets there — otherwise Home and End would jump the cursor out of the box being typed
 * into. The move buttons are the reorder affordance for the same reason drag alone would be wrong:
 * they work from the keyboard.
 */

type Props = {
  spec: EntitySpec;
  rows: EntityRow[];
  canManage: boolean;
};

type Draft = Record<string, string>;

type PendingDelete = { row: EntityRow; reassignTo: string };

function blankDraft(spec: EntitySpec): Draft {
  const draft: Draft = {};
  for (const column of spec.columns) draft[column.key] = '';
  const type = spec.columns.find((column) => column.kind === 'select');
  if (type?.choices?.length) draft[type.key] = type.choices[0].value;
  return draft;
}

function columnEnabled(column: ColumnSpec, values: Draft): boolean {
  if (!column.enabledWhen) return true;
  return column.enabledWhen.values.includes(values[column.enabledWhen.key] ?? '');
}

function stopGridKeys(event: KeyboardEvent<HTMLElement>) {
  event.stopPropagation();
}

export function CollectionPanel({ spec, rows, canManage }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  /** Only the cells the organizer has touched since the last save; everything else reads props. */
  const [edits, setEdits] = useState<Record<string, Draft>>({});
  const [draft, setDraft] = useState<Draft>(() => blankDraft(spec));
  const [confirming, setConfirming] = useState<PendingDelete | null>(null);

  const nameKey = spec.columns[0].key;

  const valueOf = (row: EntityRow, key: string): string =>
    edits[row.id]?.[key] ?? row.values[key] ?? '';

  const rowValues = (row: EntityRow): Draft => ({ ...row.values, ...(edits[row.id] ?? {}) });

  const run = (work: () => Promise<{ ok: boolean; message?: string }>, success: string) => {
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        toast({ title: result.message ?? 'That did not work', tone: 'danger' });
        return;
      }
      toast({ title: success, tone: 'success' });
      router.refresh();
    });
  };

  /**
   * A pending edit is dropped only once the server has sent the same value back, never on the
   * success callback: clearing it there would flash the pre-save text for as long as the refresh
   * takes. `explicit` exists because a `<select>` commits inside the same handler that set the
   * state, where `edits` is still a tick behind.
   */
  useEffect(() => {
    setEdits((current) => {
      let changed = false;
      const next: Record<string, Draft> = {};
      for (const [rowId, draftValues] of Object.entries(current)) {
        const row = rows.find((candidate) => candidate.id === rowId);
        if (!row) {
          changed = true;
          continue;
        }
        const kept: Draft = {};
        for (const [key, value] of Object.entries(draftValues)) {
          if (value === (row.values[key] ?? '')) changed = true;
          else kept[key] = value;
        }
        if (Object.keys(kept).length > 0) next[rowId] = kept;
        else changed = true;
      }
      return changed ? next : current;
    });
  }, [rows]);

  const commitCell = (row: EntityRow, key: string, explicit?: string) => {
    const next = explicit ?? edits[row.id]?.[key];
    if (next === undefined || next === (row.values[key] ?? '')) return;

    startTransition(async () => {
      const result = await updateRowAction(spec.kind, row.id, { [key]: next });
      if (!result.ok) {
        toast({ title: result.message, tone: 'danger' });
        return;
      }
      router.refresh();
    });
  };

  const setCell = (rowId: string, key: string, value: string) =>
    setEdits((current) => ({ ...current, [rowId]: { ...(current[rowId] ?? {}), [key]: value } }));

  const addRow = () => {
    if (!draft[nameKey]?.trim()) {
      toast({ title: `A ${spec.singular} needs a name`, tone: 'warning' });
      return;
    }
    startTransition(async () => {
      const result = await createRowAction(spec.kind, draft);
      if (!result.ok) {
        toast({ title: result.message, tone: 'danger' });
        return;
      }
      setDraft(blankDraft(spec));
      router.refresh();
    });
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const ordered = rows.map((row) => row.id);
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    run(() => reorderRowsAction(spec.kind, ordered), 'Order saved');
  };

  const deleteRow = (row: EntityRow) => {
    if (row.usage > 0) {
      setConfirming({ row, reassignTo: '' });
      return;
    }
    run(
      () => removeRowAction(spec.kind, row.id),
      `${row.values[nameKey] || 'Row'} deleted`,
    );
  };

  const confirmDelete = () => {
    if (!confirming) return;
    const { row, reassignTo } = confirming;
    setConfirming(null);
    run(
      () =>
        removeRowAction(
          spec.kind,
          row.id,
          reassignTo ? { reassignTo } : { force: true },
        ),
      reassignTo
        ? `Moved ${row.usage} across and deleted ${row.values[nameKey]}`
        : `${row.values[nameKey]} deleted`,
    );
  };

  const renderControl = (
    column: ColumnSpec,
    values: Draft,
    value: string,
    onChange: (next: string) => void,
    onCommit: (next?: string) => void,
    label: string,
  ) => {
    const disabled = !canManage || !columnEnabled(column, values);

    if (column.kind === 'color') {
      return (
        <span className={styles.colorCell}>
          <span
            className={styles.swatch}
            style={value ? { background: `var(${value})` } : undefined}
            data-empty={value ? undefined : true}
            aria-hidden
          />
          <Select
            selectSize="sm"
            aria-label={label}
            value={value}
            disabled={disabled}
            onKeyDown={stopGridKeys}
            onChange={(event) => {
              onChange(event.target.value);
              onCommit(event.target.value);
            }}
          >
            <option value="">No colour</option>
            {COLOR_TOKENS.map((entry) => (
              <option key={entry.token} value={entry.token}>
                {entry.label}
              </option>
            ))}
          </Select>
        </span>
      );
    }

    if (column.kind === 'select') {
      return (
        <Select
          selectSize="sm"
          aria-label={label}
          value={value}
          disabled={disabled}
          onKeyDown={stopGridKeys}
          onChange={(event) => {
            onChange(event.target.value);
            onCommit(event.target.value);
          }}
        >
          {(column.choices ?? []).map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </Select>
      );
    }

    return (
      <Input
        inputSize="sm"
        aria-label={label}
        className={column.mono ? styles.mono : undefined}
        type={column.kind === 'number' ? 'number' : 'text'}
        inputMode={column.kind === 'number' ? 'numeric' : undefined}
        placeholder={column.placeholder}
        value={value}
        disabled={disabled}
        onKeyDown={(event) => {
          stopGridKeys(event);
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => onCommit()}
      />
    );
  };

  const columns: Array<DataTableColumn<EntityRow>> = (() => {
    const cells: Array<DataTableColumn<EntityRow>> = spec.columns.map((column) => ({
      id: column.key,
      header: column.label,
      width: column.width,
      render: (row) =>
        renderControl(
          column,
          rowValues(row),
          valueOf(row, column.key),
          (next) => setCell(row.id, column.key, next),
          (next) => commitCell(row, column.key, next),
          `${column.label} for ${row.values[nameKey] || 'this row'}`,
        ),
    }));

    cells.push({
      id: 'usage',
      header: 'In use',
      width: '10%',
      align: 'right',
      render: (row) =>
        row.usage > 0 ? (
          <Badge tone="info" title={`Used by ${row.usage} ${spec.usageNoun}`}>
            {row.usage}
          </Badge>
        ) : (
          <span className={styles.faint}>—</span>
        ),
    });

    cells.push({
      id: 'actions',
      header: <span className={styles.visuallyHidden}>Actions</span>,
      width: 'calc(var(--control-md) * 3.4)',
      align: 'right',
      render: (row, index) => (
        <span className={styles.rowActions}>
          {spec.orderable ? (
            <>
              <IconButton
                label={`Move ${row.values[nameKey]} up`}
                size="xs"
                disabled={!canManage || index === 0 || pending}
                onKeyDown={stopGridKeys}
                onClick={() => move(index, -1)}
              >
                <ChevronUp size={14} />
              </IconButton>
              <IconButton
                label={`Move ${row.values[nameKey]} down`}
                size="xs"
                disabled={!canManage || index === rows.length - 1 || pending}
                onKeyDown={stopGridKeys}
                onClick={() => move(index, 1)}
              >
                <ChevronDown size={14} />
              </IconButton>
            </>
          ) : null}
          <IconButton
            label={`Delete ${row.values[nameKey]}`}
            size="xs"
            variant="danger"
            disabled={!canManage || pending}
            onKeyDown={stopGridKeys}
            onClick={() => deleteRow(row)}
          >
            <Trash2 size={14} />
          </IconButton>
        </span>
      ),
    });

    return cells;
  })();

  const siblings = confirming ? rows.filter((row) => row.id !== confirming.row.id) : [];

  return (
    <section className={styles.panel} aria-label={spec.label}>
      <p className={styles.lede}>{spec.lede}</p>

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        label={spec.label}
        emptyState={`No ${spec.label.toLowerCase()} yet. Add the first one below.`}
      />

      {canManage ? (
        <div className={styles.newRow}>
          {spec.columns.map((column) => (
            <label key={column.key} className={styles.newCell} style={{ width: column.width }}>
              <span className={styles.newLabel}>{column.label}</span>
              {renderControl(
                column,
                draft,
                draft[column.key] ?? '',
                (next) => setDraft((current) => ({ ...current, [column.key]: next })),
                () => undefined,
                `New ${spec.singular} ${column.label.toLowerCase()}`,
              )}
            </label>
          ))}
          <Button
            variant="primary"
            size="sm"
            iconLeft={<Plus size={14} />}
            loading={pending}
            onClick={addRow}
          >
            Add {spec.singular}
          </Button>
        </div>
      ) : null}

      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => (open ? undefined : setConfirming(null))}
        title={`Delete ${confirming?.row.values[nameKey] ?? ''}?`}
        description={
          spec.reassignable
            ? `${confirming?.row.usage ?? 0} ${spec.usageNoun} still point at this ${spec.singular}. Move them somewhere first, or delete anyway and leave the field empty on each one.`
            : `${confirming?.row.usage ?? 0} ${spec.usageNoun} were built from this ${spec.singular}. They keep their question; they only lose the link back to the library.`
        }
        footer={
          <>
            <Button onClick={() => setConfirming(null)}>Keep it</Button>
            <Button variant="danger" onClick={confirmDelete}>
              {confirming?.reassignTo ? 'Move and delete' : 'Delete anyway'}
            </Button>
          </>
        }
      >
        {spec.reassignable ? (
          <label className={styles.field}>
            <span className={styles.label}>Move them to</span>
            <Select
              value={confirming?.reassignTo ?? ''}
              onChange={(event) =>
                setConfirming((current) =>
                  current ? { ...current, reassignTo: event.target.value } : current,
                )
              }
            >
              <option value="">Nothing — leave the field empty</option>
              {siblings.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.values[nameKey]}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
      </Dialog>
    </section>
  );
}
