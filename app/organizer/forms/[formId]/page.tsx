import { notFound } from 'next/navigation';
import { isAppError } from '../../../../lib/errors';
import { getEvent } from '../../../../lib/services/events';
import { PARTICIPANT_BUILTIN_META, isParticipantBuiltinKey } from '../../../../lib/forms/contract';
import { getForm, listFieldLibrary } from '../../../../lib/services/forms';
import { formManageContext } from '../context';
import { FormBuilder } from './FormBuilder';
import type {
  BuilderFieldView,
  FormView,
  LibraryEntryView,
  ParticipantFieldView,
  RoleView,
} from './builder-types';

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
    targetType: detail.form.targetType,
    collectsParticipants: detail.form.collectsParticipants,
    externalTitle: detail.form.externalTitle,
    pageHeading: detail.form.pageHeading,
    showWelcome: detail.form.showWelcome,
    maxParticipants: detail.form.maxParticipants,
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

  const toView = (field: (typeof detail.fields)[number]): BuilderFieldView => ({
    id: field.id,
    key: field.key,
    entity: field.entity,
    builtinKey: field.builtinKey,
    participantKey: field.participantKey,
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
  });

  const fields: BuilderFieldView[] = detail.fields.map(toView);

  const participantFields: ParticipantFieldView[] = detail.participantFields.map((field) => ({
    ...toView(field),
    participantKey: field.participantKey,
    requiredLocked:
      isParticipantBuiltinKey(field.participantKey) &&
      PARTICIPANT_BUILTIN_META[field.participantKey].requiredLocked,
  }));

  const roles: RoleView[] = detail.roles;

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
      participantFields={participantFields}
      roles={roles}
      library={libraryEntries}
      eventSlug={event.slug}
    />
  );
}
