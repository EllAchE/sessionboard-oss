import * as forms from '../../../../lib/services/forms';
import * as review from '../../../../lib/services/review';
import { DEFAULT_LEVELS } from '../../../../lib/services/submissions';
import { decideContext } from '../context';
import { NewSubmissionForm, type FormOptionWire } from './NewSubmissionForm';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Add submission · Cicero' };

/**
 * `V-7`. Every CFP form is offered, including a closed one: the reason an organizer is on this
 * screen at all is usually an invited talk that the CFP was never going to receive.
 */
export default async function NewSubmissionPage() {
  const ctx = await decideContext();
  const [available, bundle] = await Promise.all([forms.listForms(ctx), review.loadQueue(ctx, {})]);

  const cfpForms = available.filter((entry) => entry.kind === 'cfp');
  const details = await Promise.all(cfpForms.map((entry) => forms.getForm(ctx, entry.id)));

  const options: FormOptionWire[] = details.map((detail) => {
    const builtins = detail.fields.filter((field) => field.builtinKey !== null);
    const levelField = builtins.find((field) => field.builtinKey === 'level');
    return {
      id: detail.form.id,
      name: detail.form.name,
      status: detail.form.status,
      builtinKeys: builtins.map((field) => field.builtinKey as string),
      requiredKeys: builtins
        .filter((field) => field.required)
        .map((field) => field.builtinKey as string),
      labels: Object.fromEntries(
        builtins.map((field) => [field.builtinKey as string, field.label]),
      ),
      levelOptions: levelField?.options?.length ? levelField.options : [...DEFAULT_LEVELS],
      customFields: detail.fields
        .filter((field) => field.builtinKey === null && field.type !== 'section_break')
        .map((field) => ({
          id: field.id,
          label: field.label,
          type: field.type,
          required: field.required,
        })),
    };
  });

  return (
    <NewSubmissionForm
      forms={options}
      tracks={bundle.tracks}
      formats={bundle.formats}
      tags={bundle.tags}
    />
  );
}
