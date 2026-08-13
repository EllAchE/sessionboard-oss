'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Card, Input, Switch } from '../../../../components/ui';
import {
  PARTICIPANT_ROLE_DEFAULT_LABELS,
  PARTICIPANT_ROLE_KINDS,
  type ParticipantRoleKind,
} from '../../../../lib/forms/contract';
import type { FieldPatchWire, RoleInputWire } from '../types';
import type { FormView, ParticipantFieldView, RoleView } from './builder-types';
import styles from './builder.module.css';

/**
 * `F-6` and `F-7` in one place, because they are one decision. Who may be on a submission, how many
 * of them, and what each of them is asked — an organizer who sets a maximum of one moderator and then
 * cannot find where the moderator's phone number is asked for has been given half a feature.
 *
 * The participant *questions* are the same `form_field` rows the abstract questions are, so they get
 * the same treatment: relabel them, reorder them, switch the optional ones off. The three that
 * identify the person do not get a Required toggle at all, which is `F-6`'s "(all locked)".
 */

type RoleDraft = {
  kind: ParticipantRoleKind;
  enabled: boolean;
  label: string;
  minCount: string;
  maxCount: string;
};

function toRoleDrafts(roles: RoleView[]): RoleDraft[] {
  const configured = new Map(roles.map((role) => [role.kind, role]));
  // Every role the product has is listed, in the order the form put them, then the rest. An organizer
  // switching one on should not have to guess that the option exists.
  const ordered = [
    ...roles.map((role) => role.kind),
    ...PARTICIPANT_ROLE_KINDS.filter((kind) => !configured.has(kind)),
  ];
  return ordered.map((kind) => {
    const role = configured.get(kind);
    return {
      kind,
      enabled: Boolean(role),
      label: role?.label ?? PARTICIPANT_ROLE_DEFAULT_LABELS[kind],
      minCount: String(role?.minCount ?? 0),
      maxCount: role?.maxCount === null || role?.maxCount === undefined ? '' : String(role.maxCount),
    };
  });
}

function toWire(drafts: RoleDraft[]): RoleInputWire[] {
  return drafts
    .filter((draft) => draft.enabled)
    .map((draft) => ({
      kind: draft.kind,
      label: draft.label.trim() || PARTICIPANT_ROLE_DEFAULT_LABELS[draft.kind],
      minCount: Number(draft.minCount.trim() || 0),
      maxCount: draft.maxCount.trim() ? Number(draft.maxCount.trim()) : null,
    }));
}

export function ParticipantsPanel({
  form,
  fields,
  roles,
  busy,
  onSaveRoles,
  onPatchField,
}: {
  form: FormView;
  fields: ParticipantFieldView[];
  roles: RoleView[];
  busy: boolean;
  onSaveRoles: (roles: RoleInputWire[], maxParticipants: number | null) => void;
  onPatchField: (fieldId: string, patch: FieldPatchWire) => void;
}) {
  const [drafts, setDrafts] = useState<RoleDraft[]>(() => toRoleDrafts(roles));
  const [cap, setCap] = useState(form.maxParticipants === null ? '' : String(form.maxParticipants));

  useEffect(() => {
    setDrafts(toRoleDrafts(roles));
  }, [roles]);

  useEffect(() => {
    setCap(form.maxParticipants === null ? '' : String(form.maxParticipants));
  }, [form.maxParticipants]);

  const updateRole = (kind: ParticipantRoleKind, patch: Partial<RoleDraft>) =>
    setDrafts((current) =>
      current.map((draft) => (draft.kind === kind ? { ...draft, ...patch } : draft)),
    );

  if (!form.collectsParticipants) {
    return (
      <Card padding="md">
        <p className={styles.panelTitle}>Participants are off for this form</p>
        <p className={styles.help}>
          Turn on <strong>Collect participants</strong> in Settings and the public form gains a
          participant step, with the fields and roles you configure here.
        </p>
      </Card>
    );
  }

  return (
    <div className={styles.stack}>
      {/* `F-6` */}
      <Card padding="md">
        <p className={styles.panelTitle}>What each participant is asked</p>
        <div className={styles.stack}>
          {fields.map((field) => (
            <div className={styles.switchRow} key={field.id}>
              <span className={styles.switchText}>
                <span className={styles.switchLabel}>
                  {field.label}{' '}
                  {field.requiredLocked ? <Badge tone="neutral">Always required</Badge> : null}
                </span>
                <span className={styles.help}>
                  {field.maxLength ? `Up to ${field.maxLength} characters. ` : ''}
                  {field.requiredLocked
                    ? 'This is what identifies the person, so it cannot be switched off.'
                    : 'Required, or optional — the question is always asked.'}
                </span>
              </span>
              <Switch
                checked={field.required}
                disabled={busy || field.requiredLocked}
                aria-label={`${field.label} required`}
                onCheckedChange={(next) => onPatchField(field.id, { required: next })}
              />
            </div>
          ))}
          {fields.length === 0 && (
            <p className={styles.help}>
              This form has no participant questions yet. Publishing it adds the built-in set.
            </p>
          )}
        </div>
      </Card>

      {/* `F-7` */}
      <Card padding="md">
        <p className={styles.panelTitle}>Roles and how many of each</p>
        <div className={styles.stack}>
          {drafts.map((draft) => (
            <div className={styles.stack} key={draft.kind}>
              <div className={styles.switchRow}>
                <span className={styles.switchText}>
                  <span className={styles.switchLabel}>
                    {PARTICIPANT_ROLE_DEFAULT_LABELS[draft.kind]}
                  </span>
                  <span className={styles.help}>
                    {draft.enabled
                      ? 'Offered on the participant step.'
                      : 'Not offered on this form.'}
                  </span>
                </span>
                <Switch
                  checked={draft.enabled}
                  disabled={busy}
                  aria-label={`Offer ${PARTICIPANT_ROLE_DEFAULT_LABELS[draft.kind]}`}
                  onCheckedChange={(next) => updateRole(draft.kind, { enabled: next })}
                />
              </div>

              {draft.enabled && (
                <div className={styles.grid2}>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor={`role-${draft.kind}-label`}>
                      Shown as
                    </label>
                    <Input
                      id={`role-${draft.kind}-label`}
                      value={draft.label}
                      disabled={busy}
                      onChange={(event) => updateRole(draft.kind, { label: event.target.value })}
                    />
                  </div>
                  <div className={styles.grid2}>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor={`role-${draft.kind}-min`}>
                        At least
                      </label>
                      <Input
                        id={`role-${draft.kind}-min`}
                        type="number"
                        min={0}
                        value={draft.minCount}
                        disabled={busy}
                        onChange={(event) =>
                          updateRole(draft.kind, { minCount: event.target.value })
                        }
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor={`role-${draft.kind}-max`}>
                        At most
                      </label>
                      <Input
                        id={`role-${draft.kind}-max`}
                        type="number"
                        min={1}
                        placeholder="No limit"
                        value={draft.maxCount}
                        disabled={busy}
                        onChange={(event) =>
                          updateRole(draft.kind, { maxCount: event.target.value })
                        }
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          <hr className={styles.divider} />

          <div className={styles.field}>
            <label className={styles.label} htmlFor="settings-participant-cap">
              People per submission, all roles together
            </label>
            <Input
              id="settings-participant-cap"
              type="number"
              min={1}
              placeholder="No cap"
              value={cap}
              disabled={busy}
              onChange={(event) => setCap(event.target.value)}
            />
            <span className={styles.help}>
              Blank means as many as the per-role limits allow. Both are enforced when a talk is
              submitted and when a speaker shares one from their portal.
            </span>
          </div>
        </div>
      </Card>

      <div className={styles.actions}>
        <Button
          variant="primary"
          loading={busy}
          onClick={() => onSaveRoles(toWire(drafts), cap.trim() ? Number(cap.trim()) : null)}
        >
          Save participants
        </Button>
      </div>
    </div>
  );
}
