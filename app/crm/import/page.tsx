import { IMPORT_FIELDS, SAMPLE_CSV } from '@/lib/services/crm';
import { ImportWizard } from './ImportWizard';

export const metadata = { title: 'Import contacts · Cicero' };

export default function ImportPage() {
  return (
    <ImportWizard
      fields={IMPORT_FIELDS.map((field) => ({
        key: field.key,
        label: field.label,
        required: field.required,
      }))}
      sampleCsv={SAMPLE_CSV}
    />
  );
}
