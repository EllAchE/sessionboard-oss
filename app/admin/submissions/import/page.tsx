import * as forms from '../../../../lib/services/forms';
import { decideContext } from '../context';
import { ImportSubmissions, type ImportFormWire } from './ImportSubmissions';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Import petitions · Cicero' };

/**
 * `V-10`. The spreadsheet an organizer is migrating from is the reason this exists, so a closed
 * form is still a valid target: the import is a backfill, not a submission window.
 */
export default async function ImportSubmissionsPage() {
  const ctx = await decideContext();
  const available = await forms.listForms(ctx);

  const options: ImportFormWire[] = available
    .filter((entry) => entry.kind === 'cfp')
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      status: entry.status,
      submissionCount: entry.submissionCount,
    }));

  return <ImportSubmissions forms={options} />;
}
