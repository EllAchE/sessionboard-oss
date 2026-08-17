'use client';

import { useDraggable } from '@dnd-kit/core';
import { Plus, Trash2 } from 'lucide-react';
import { Card, IconButton, Tooltip } from '../../../../components/ui';
import { FIELD_TYPE_OPTIONS, charLimitGroups, fieldTypeLabel } from '../field-rules';
import type { FieldType } from '../../../../lib/forms/contract';
import type { BuilderFieldView, LibraryEntryView } from './builder-types';
import styles from './builder.module.css';

/**
 * The palette. Every row is both draggable — onto any step — and clickable, because a keyboard-only
 * organizer must be able to build a form too and a pointer drag is not an accessible primitive.
 */
function PaletteRow({
  id,
  data,
  label,
  hint,
  disabled,
  onAdd,
  addLabel,
  trailing,
}: {
  id: string;
  data: Record<string, unknown>;
  label: string;
  hint: string;
  disabled: boolean;
  onAdd: () => void;
  addLabel: string;
  trailing?: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data, disabled });

  return (
    <div className={styles.libraryRow}>
      <button
        ref={setNodeRef}
        type="button"
        className={styles.paletteButton}
        data-dragging={isDragging ? 'true' : undefined}
        onClick={onAdd}
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <span className={styles.libraryName}>
          <span className={styles.libraryLabel}>{label}</span>
          {hint ? <span className={styles.libraryHint}>{hint}</span> : null}
        </span>
      </button>
      <span className={styles.rowTrailing}>
        {trailing}
        <Tooltip content={addLabel}>
          <IconButton label={addLabel} size="xs" disabled={disabled} onClick={onAdd}>
            <Plus size={13} aria-hidden="true" />
          </IconButton>
        </Tooltip>
      </span>
    </div>
  );
}

export function BuilderSidebar({
  fields,
  library,
  busy,
  onAddType,
  onAddLibraryEntry,
  onDeleteLibraryEntry,
}: {
  fields: readonly BuilderFieldView[];
  library: readonly LibraryEntryView[];
  busy: boolean;
  onAddType: (type: FieldType) => void;
  onAddLibraryEntry: (entryId: string) => void;
  onDeleteLibraryEntry: (entryId: string) => void;
}) {
  const groups = charLimitGroups(fields);

  return (
    <aside className={styles.sidebar}>
      <Card padding="sm">
        <p className={styles.panelTitle}>Add a question</p>
        <p className={styles.help}>Drag onto a step, or click to append it to the last step.</p>
        <div className={styles.libraryList}>
          {FIELD_TYPE_OPTIONS.map((option) => (
            <PaletteRow
              key={option.value}
              id={`palette:${option.value}`}
              data={{ source: 'palette', type: option.value }}
              label={option.label}
              hint={option.hint}
              disabled={busy}
              addLabel={`Add a ${option.label.toLowerCase()} question`}
              onAdd={() => onAddType(option.value)}
            />
          ))}
        </div>
      </Card>

      <Card padding="sm">
        <p className={styles.panelTitle}>Field library</p>
        {library.length === 0 ? (
          <p className={styles.help}>Saved questions can be reused across this event.</p>
        ) : (
          <div className={styles.libraryList}>
            {library.map((entry) => (
              <PaletteRow
                key={entry.id}
                id={`library:${entry.id}`}
                data={{ source: 'library', entryId: entry.id }}
                label={entry.label}
                hint={fieldTypeLabel(entry.type)}
                disabled={busy}
                addLabel={`Add ${entry.label} from the library`}
                onAdd={() => onAddLibraryEntry(entry.id)}
                trailing={
                  <Tooltip content="Remove from the library">
                    <IconButton
                      label={`Remove ${entry.label} from the library`}
                      size="xs"
                      variant="danger"
                      disabled={busy}
                      onClick={() => onDeleteLibraryEntry(entry.id)}
                    >
                      <Trash2 size={13} aria-hidden="true" />
                    </IconButton>
                  </Tooltip>
                }
              />
            ))}
          </div>
        )}
      </Card>

      <Card padding="sm">
        <p className={styles.panelTitle}>Combined limits</p>
        {groups.length === 0 ? (
          <p className={styles.help}>
            Questions with the same limit group share one character limit.
          </p>
        ) : (
          <div className={styles.groupSummary}>
            {groups.map((group) => (
              <span key={group.group}>
                <strong>{group.group}</strong>: {group.limit} characters across{' '}
                {group.fields.map((field) => field.label).join(', ')}
              </span>
            ))}
          </div>
        )}
      </Card>
    </aside>
  );
}
