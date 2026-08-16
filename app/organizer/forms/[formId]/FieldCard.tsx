'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BookmarkPlus, GripVertical, Lock, Pencil, Trash2 } from 'lucide-react';
import { Badge, IconButton, Tooltip } from '../../../../components/ui';
import {
  canDeleteField,
  describeCondition,
  fieldTypeLabel,
  isLockedField,
  lockReason,
} from '../field-rules';
import type { BuilderFieldView, FieldDragData } from './builder-types';
import styles from './builder.module.css';

/**
 * One question in the running order. The card is deliberately a summary — everything editable lives
 * behind the pencil, so a long form stays scannable and a drag target stays a drag target.
 */
export function FieldCard({
  field,
  fields,
  disabled,
  onEdit,
  onDelete,
  onSaveToLibrary,
}: {
  field: BuilderFieldView;
  fields: readonly BuilderFieldView[];
  disabled: boolean;
  onEdit: (fieldId: string) => void;
  onDelete: (fieldId: string) => void;
  onSaveToLibrary: (fieldId: string) => void;
}) {
  const data: FieldDragData = { source: 'field', fieldId: field.id, step: field.step };
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
    data,
    disabled,
  });

  const locked = isLockedField(field);
  const reason = lockReason(field);
  const conditionTarget = field.showIf
    ? fields.find((candidate) => candidate.id === field.showIf?.fieldId)
    : undefined;

  return (
    <div
      ref={setNodeRef}
      className={styles.fieldCard}
      data-dragging={isDragging ? 'true' : undefined}
      data-section={field.type === 'section_break' ? 'true' : undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        type="button"
        className={styles.grip}
        aria-label={`Reorder ${field.label}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={15} aria-hidden="true" />
      </button>

      <div className={styles.fieldBody}>
        <div className={styles.fieldTitleRow}>
          <span className={styles.fieldLabel}>{field.label}</span>
          {locked && reason ? (
            <Tooltip content={reason}>
              <span className={styles.lock} tabIndex={0} role="note" aria-label={reason}>
                <Lock size={13} aria-hidden="true" />
              </span>
            </Tooltip>
          ) : null}
          {field.required ? <Badge tone="accent">Required</Badge> : null}
          {field.libraryEntryId ? <Badge tone="info">Library</Badge> : null}
        </div>

        <div className={styles.fieldMeta}>
          <span>{fieldTypeLabel(field.type)}</span>
          <span className={styles.fieldKey}>{field.key}</span>
          {field.maxLength ? <span>max {field.maxLength}</span> : null}
          {field.charLimitGroup ? <span>combined limit “{field.charLimitGroup}”</span> : null}
          {field.options && field.options.length > 0 ? (
            <span>
              {field.options.length} choice{field.options.length === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>

        {field.showIf ? (
          <span className={styles.condition}>{describeCondition(field.showIf, conditionTarget)}</span>
        ) : null}
      </div>

      <div className={styles.fieldActions}>
        <Tooltip content="Edit question">
          <IconButton
            label={`Edit ${field.label}`}
            size="sm"
            disabled={disabled}
            onClick={() => onEdit(field.id)}
          >
            <Pencil size={14} aria-hidden="true" />
          </IconButton>
        </Tooltip>
        {!locked && field.type !== 'section_break' ? (
          <Tooltip content="Save to the field library">
            <IconButton
              label={`Save ${field.label} to the field library`}
              size="sm"
              disabled={disabled || Boolean(field.libraryEntryId)}
              onClick={() => onSaveToLibrary(field.id)}
            >
              <BookmarkPlus size={14} aria-hidden="true" />
            </IconButton>
          </Tooltip>
        ) : null}
        <Tooltip content={reason ?? 'Delete question'}>
          <IconButton
            label={`Delete ${field.label}`}
            size="sm"
            variant="danger"
            disabled={disabled || !canDeleteField(field)}
            onClick={() => onDelete(field.id)}
          >
            <Trash2 size={14} aria-hidden="true" />
          </IconButton>
        </Tooltip>
      </div>
    </div>
  );
}
