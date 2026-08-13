import { listPipeline } from '@/lib/services/crm';
import { requireCrmOrganizer } from '../context';
import { PipelineBoard } from './PipelineBoard';
import { toColumnWire } from '../serialize';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Sourcing pipeline · Cicero' };

export default async function PipelinePage() {
  const actor = await requireCrmOrganizer();
  const columns = await listPipeline(actor);
  return <PipelineBoard columns={columns.map(toColumnWire)} />;
}
