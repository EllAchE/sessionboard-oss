'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  Button,
  Dialog,
  IconButton,
  Input,
  Select,
  Switch,
  Textarea,
} from '../../../../components/ui';
import type { Condition, ConditionOp } from '../../../../lib/forms/contract';
import {
  CONDITION_OP_LABELS,
  FIELD_TYPE_OPTIONS,
  canAddOptions,
  canChangeFieldType,
  conditionOpsFor,
  eligibleConditionTargets,
  isLockedField,
  lockReason,
  opNeedsValue,
  supportsLength,
  supportsOptions,
} from '../field-rules';
import type { FieldPatchWire } from '../types';
import type { BuilderFieldView } from './builder-types';
import styles from './builder.module.css';

type Draft = {
  label: string;
  type: BuilderFieldView['type'];
  helpText: string;
  placeholder: string;
  required: boolean;
  options: string[];
  minLength: string;
  maxLength: string;
  charLimitGroup: string;
  showIf: Condition | null;
};

function toDraft(field: BuilderFieldView): Draft {
  return {
    label: field.label,
    type: field.type,
    helpText: field.helpText ?? '',
    placeholder: field.placeholder ?? '',
    required: field.required,
    options: field.options ?? [],
    minLength: field.minLength === null ? '' : String(field.minLength),
    maxLength: field.maxLength === null ? '' : String(field.maxLength),
    charLimitGroup: field.charLimitGroup ?? '',
    showIf: field.showIf,
  };
}

function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

/**
 * Everything about one question. The condition editor is the reason this is a dialog rather than a
 * 300px panel: the one-hop rule is only obvious when the organizer can see the whole sentence they
 * are building at once.
 */
export function FieldEditor({
  field,
  fields,
  busy,
  error,
  onSave,
  onClose,
}: {
  field: BuilderFieldView | null;
  fields: readonly BuilderFieldView[];
  busy: boolean;
  error: string | null;
  onSave: (fieldId: string, patch: FieldPatchWire) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(field ? toDraft(field) : null);

  useEffect(() => {
    setDraft(field ? toDraft(field) : null);
  }, [field]);

  if (!field || !draft) return null;

  const locked = isLockedField(field);
  const eligible = eligibleConditionTargets(fields, field.id);
  const conditionTarget = draft.showIf
    ? fields.find((candidate) => candidate.id === draft.showIf?.fieldId)
    : undefined;
  const ops = conditionTarget ? conditionOpsFor(conditionTarget.type) : [];

  const update = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });

  const setOption = (index: number, value: string) =>
    update({ options: draft.options.map((option, i) => (i === index ? value : option)) });

  const startCondition = () => {
    const first = eligible[0];
    if (!first) return;
    const [op] = conditionOpsFor(first.type);
    update({ showIf: { fieldId: first.id, op: op ?? 'not_empty', value: '' } });
  };

  const changeConditionField = (fieldId: string) => {
    const target = fields.find((candidate) => candidate.id === fieldId);
    const [op] = target ? conditionOpsFor(target.type) : ([] as ConditionOp[]);
    update({ showIf: { fieldId, op: op ?? 'not_empty', value: '' } });
  };

  const save = () => {
    const patch: FieldPatchWire = {
      label: draft.label,
      helpText: draft.helpText.trim() || null,
      placeholder: draft.placeholder.trim() || null,
      required: draft.required,
      showIf: draft.showIf,
    };
    if (canChangeFieldType(field)) patch.type = draft.type;
    if (supportsOptions(draft.type)) patch.options = draft.options;
    if (supportsLength(draft.type)) {
      patch.minLength = toNumberOrNull(draft.minLength);
      patch.maxLength = toNumberOrNull(draft.maxLength);
      patch.charLimitGroup = draft.charLimitGroup.trim() || null;
    }
    onSave(field.id, patch);
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={`Revise “${field.label}”`}
      description={locked ? (lockReason(field) ?? undefined) : `Ledger key ${field.key}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Leave unchanged
          </Button>
          <Button variant="primary" loading={busy} disabled={!draft.label.trim()} onClick={save}>
            Seal prompt
          </Button>
        </>
      }
    >
      <div className={styles.stack}>
        {error ? <p className={`${styles.banner} ${styles.bannerError}`}>{error}</p> : null}

        <div className={styles.grid2}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="field-label">
              Prompt
            </label>
            <Input
              id="field-label"
              value={draft.label}
              onChange={(event) => update({ label: event.target.value })}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="field-type">
              Inscription style
            </label>
            <Select
              id="field-type"
              value={draft.type}
              disabled={!canChangeFieldType(field)}
              onChange={(event) => update({ type: event.target.value as Draft['type'] })}
            >
              {FIELD_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            {locked ? <span className={styles.help}>Foundational inscriptions keep their style.</span> : null}
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="field-help">
            Guidance beneath the prompt
          </label>
          <Textarea
            id="field-help"
            rows={2}
            value={draft.helpText}
            onChange={(event) => update({ helpText: event.target.value })}
          />
          <span className={styles.help}>Shown beneath the prompt on the public scroll.</span>
        </div>

        {draft.type !== 'section_break' ? (
          <>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="field-placeholder">
                Example response
              </label>
              <Input
                id="field-placeholder"
                value={draft.placeholder}
                onChange={(event) => update({ placeholder: event.target.value })}
              />
            </div>

            <div className={styles.switchRow}>
              <span className={styles.switchText}>
                <span className={styles.switchLabel}>Required by decree</span>
                <span className={styles.help}>A petitioner cannot lodge the scroll without answering.
                </span>
              </span>
              <Switch
                checked={draft.required}
                aria-label="Required by decree"
                onCheckedChange={(next) => update({ required: next })}
              />
            </div>
          </>
        ) : null}

        {supportsOptions(draft.type) ? (
          <div className={styles.field}>
            <span className={styles.label}>Permitted responses</span>
            {canAddOptions(field) ? (
              <>
                <div className={styles.optionsList}>
                  {draft.options.map((option, index) => (
                    <div className={styles.optionRow} key={index}>
                      <Input
                        value={option}
                        aria-label={`Response ${index + 1}`}
                        onChange={(event) => setOption(index, event.target.value)}
                      />
                      <IconButton
                        label={`Remove response ${index + 1}`}
                        size="sm"
                        variant="danger"
                        onClick={() =>
                          update({ options: draft.options.filter((_, i) => i !== index) })
                        }
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </IconButton>
                    </div>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  iconLeft={<Plus size={14} />}
                  onClick={() => update({ options: [...draft.options, ''] })}
                >
                  Add a response
                </Button>
              </>
            ) : (
              <span className={styles.help}>
                This foundational inscription reads its responses from the assembly&rsquo;s themes,
                formats, ranks, and marks, so they are governed by the Edicts.
              </span>
            )}
          </div>
        ) : null}

        {supportsLength(draft.type) ? (
          <>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="field-min">
                  Minimum length
                </label>
                <Input
                  id="field-min"
                  type="number"
                  min={0}
                  value={draft.minLength}
                  onChange={(event) => update({ minLength: event.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="field-max">
                  Maximum length
                </label>
                <Input
                  id="field-max"
                  type="number"
                  min={0}
                  value={draft.maxLength}
                  onChange={(event) => update({ maxLength: event.target.value })}
                />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="field-group">
                Shared length decree
              </label>
              <Input
                id="field-group"
                value={draft.charLimitGroup}
                placeholder="abstract-and-bio"
                onChange={(event) => update({ charLimitGroup: event.target.value })}
              />
              <span className={styles.help}>
                Prompts bearing the same decree are counted together against its largest limit. The
                petitioner sees one live count for the whole group.
              </span>
            </div>
          </>
        ) : null}

        <hr className={styles.divider} />

        <div className={styles.field}>
          <span className={styles.label}>Rules of appearance</span>
          <span className={styles.help}>
            A prompt may depend on <strong>one earlier prompt</strong>, and nothing else. Only
            prompts inscribed above this one are offered, and a conditional prompt cannot govern
            another.
          </span>

          {eligible.length === 0 ? (
            <span className={styles.help}>
              No earlier prompt can govern this one yet. Move it farther down the scroll, or
              inscribe another prompt before it.
            </span>
          ) : draft.showIf ? (
            <div className={styles.conditionBox}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="condition-field">
                  Reveal this prompt when
                </label>
                <Select
                  id="condition-field"
                  value={draft.showIf.fieldId}
                  onChange={(event) => changeConditionField(event.target.value)}
                >
                  {eligible.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className={styles.grid2}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="condition-op">
                    Rule
                  </label>
                  <Select
                    id="condition-op"
                    value={draft.showIf.op}
                    onChange={(event) =>
                      update({
                        showIf: { ...draft.showIf!, op: event.target.value as ConditionOp },
                      })
                    }
                  >
                    {ops.map((op) => (
                      <option key={op} value={op}>
                        {CONDITION_OP_LABELS[op]}
                      </option>
                    ))}
                  </Select>
                </div>

                {opNeedsValue(draft.showIf.op) ? (
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="condition-value">
                      Value
                    </label>
                    {conditionTarget?.options && conditionTarget.options.length > 0 ? (
                      <Select
                        id="condition-value"
                        value={String(draft.showIf.value ?? '')}
                        onChange={(event) =>
                          update({ showIf: { ...draft.showIf!, value: event.target.value } })
                        }
                      >
                        <option value="">Choose a response…</option>
                        {conditionTarget.options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </Select>
                    ) : conditionTarget?.type === 'checkbox' ? (
                      <Select
                        id="condition-value"
                        value={String(draft.showIf.value ?? 'true')}
                        onChange={(event) =>
                          update({ showIf: { ...draft.showIf!, value: event.target.value } })
                        }
                      >
                        <option value="true">Affirmed</option>
                        <option value="false">Left blank</option>
                      </Select>
                    ) : (
                      <Input
                        id="condition-value"
                        type={
                          conditionTarget?.type === 'number'
                            ? 'number'
                            : conditionTarget?.type === 'date'
                              ? 'date'
                              : 'text'
                        }
                        value={String(draft.showIf.value ?? '')}
                        onChange={(event) =>
                          update({ showIf: { ...draft.showIf!, value: event.target.value } })
                        }
                      />
                    )}
                  </div>
                ) : null}
              </div>

              <Button size="sm" variant="ghost" onClick={() => update({ showIf: null })}>
                Always show this question
              </Button>
            </div>
          ) : (
            <div className={styles.inlineRow}>
              <Button size="sm" variant="secondary" onClick={startCondition}>
                Only show this sometimes
              </Button>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
