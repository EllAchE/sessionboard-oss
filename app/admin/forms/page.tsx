import { listForms } from '../../../lib/services/forms';
import { formManageContext } from './context';
import { FormsIndex } from './FormsIndex';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Scrolls · Cicero' };

export default async function FormsPage() {
  const ctx = await formManageContext();
  const forms = await listForms(ctx);

  return (
    <FormsIndex
      forms={forms.map((entry) => ({
        id: entry.id,
        name: entry.name,
        slug: entry.slug,
        kind: entry.kind,
        status: entry.status,
        fieldCount: entry.fieldCount,
        submissionCount: entry.submissionCount,
        closesAt: entry.closesAt ? entry.closesAt.toISOString() : null,
      }))}
    />
  );
}
