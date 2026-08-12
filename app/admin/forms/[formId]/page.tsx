import { notFound } from 'next/navigation';
import { isAppError } from '../../../../lib/errors';
import { getEvent } from '../../../../lib/services/events';
import { getForm, listFieldLibrary } from '../../../../lib/services/forms';
import { formManageContext } from '../context';
import { FormBuilder } from './FormBuilder';
import type { BuilderFieldView, FormView, LibraryEntryView } from './builder-types';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Form builder · Cicero' };

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export default async function FormBuilderPage({
  params,
}: {
  params: Promise<{ formId: string }>;
}) {
  const { formId } = await params;
  const ctx = await formManageContext();

  let detail: Awaited<ReturnType<typeof getForm>>;
  try {
    detail = await getForm(ctx, formId);
  } catch (error) {
    if (isAppError(error) && error.code === 'not_found') notFound();
    throw error;
  }

  const [event, library] = await Promise.all([getEvent(ctx.eventId), listFieldLibrary(ctx)]);

  const form: FormView = {
    id: detail.form.id,
    name: detail.form.name,
    slug: detail.form.slug,
    kind: detail.form.kind,
    status: detail.form.status,
    introMarkdown: detail.form.introMarkdown,
    opensAt: iso(detail.form.opensAt),
    closesAt: iso(detail.form.closesAt),
    maxSubmissionsPerUser: detail.form.maxSubmissionsPerUser,
    allowDrafts: detail.form.allowDrafts,
    notifyEmails: detail.form.notifyEmails ?? [],
    confirmationSubject: detail.form.confirmationSubject,
    confirmationBodyMarkdown: detail.form.confirmationBodyMarkdown,
  };

  const fields: BuilderFieldView[] = detail.fields.map((field) => ({
    id: field.id,
    key: field.key,
    builtinKey: field.builtinKey,
    type: field.type,
    label: field.label,
    position: field.position,
    step: field.step,
    required: field.required,
    options: field.options,
    showIf: field.showIf,
    minLength: field.minLength,
    maxLength: field.maxLength,
    charLimitGroup: field.charLimitGroup,
    helpText: field.helpText,
    placeholder: field.placeholder,
    libraryEntryId: field.libraryEntryId,
  }));

  const libraryEntries: LibraryEntryView[] = library.map((entry) => ({
    id: entry.id,
    key: entry.key,
    label: entry.label,
    type: entry.type,
    helpText: entry.helpText,
    options: entry.options ?? null,
  }));

  return (
    <FormBuilder
      form={form}
      fields={fields}
      library={libraryEntries}
      eventSlug={event.slug}
    />
  );
}
