import { CRM_FIELD_TYPES, fieldTakesOptions, listFields } from '@/lib/services/crm';
import { requireCrmOrganizer } from '../context';
import { FieldManager } from './FieldManager';
import { toFieldWire } from '../serialize';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Custom fields · Cicero' };

const TYPE_LABELS: Record<string, string> = {
  short_text: 'Short text',
  long_text: 'Long text',
  select: 'Dropdown (single choice)',
  multi_select: 'Dropdown (multiple choice)',
  number: 'Number',
  url: 'URL',
  date: 'Date',
};

export default async function FieldsPage() {
  const actor = await requireCrmOrganizer();
  const fields = await listFields(actor);

  return (
    <FieldManager
      fields={fields.map(toFieldWire)}
      types={CRM_FIELD_TYPES.map((value) => ({
        value,
        label: TYPE_LABELS[value] ?? value,
        takesOptions: fieldTakesOptions(value),
      }))}
    />
  );
}
