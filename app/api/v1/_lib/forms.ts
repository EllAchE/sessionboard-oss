import type { FormFieldSpec, ParticipantRoleSpec } from '@/lib/forms/contract';

/**
 * `Z-5`. One projection of a form field for every endpoint that publishes one, so the public CFP
 * contract and a portal task form cannot describe the same row two different ways.
 *
 * It exists because the three field sources in this app carry different amounts of the row.
 * `buildFieldSpecs` and `buildParticipantSpecs` return the presentation columns; the portal's task
 * form path builds a bare `FormFieldSpec`. `formFieldSchema` documents all of them as
 * required-and-nullable, and until now the task payload simply omitted three of the keys it
 * promised. Filling them in here means the schema is true of every payload rather than of one of
 * them, without any caller having to know which source it was handed.
 */
export type FormFieldSource = FormFieldSpec & {
  helpText?: string | null;
  placeholder?: string | null;
  optionLabels?: Record<string, string> | null;
};

export function formFieldPayload(field: FormFieldSource) {
  return {
    id: field.id,
    key: field.key,
    /**
     * `F-6`. Absent means `abstract` — the contract's own documented default, and what every field
     * built before the split is. Deriving it here rather than at each source is what lets the
     * discriminator be a required key in the published schema.
     */
    entity: field.entity ?? 'abstract',
    builtinKey: field.builtinKey ?? null,
    participantKey: field.participantKey ?? null,
    type: field.type,
    label: field.label,
    helpText: field.helpText ?? null,
    placeholder: field.placeholder ?? null,
    position: field.position,
    step: field.step,
    required: field.required,
    options: field.options ?? null,
    optionLabels: field.optionLabels ?? null,
    showIf: field.showIf ?? null,
    minLength: field.minLength,
    maxLength: field.maxLength,
    charLimitGroup: field.charLimitGroup,
  };
}

/** `F-7`. The role configuration a submitter has to satisfy, published as the form declares it. */
export function formParticipantRolePayload(role: ParticipantRoleSpec) {
  return {
    id: role.id,
    kind: role.kind,
    label: role.label,
    position: role.position,
    minCount: role.minCount,
    maxCount: role.maxCount,
  };
}
