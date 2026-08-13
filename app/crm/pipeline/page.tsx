import { requireCurrentActor } from '@/lib/auth';
import { listPipeline } from '@/lib/services/crm';
import { PipelineBoard } from './PipelineBoard';
import { toColumnWire } from '../serialize';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Sourcing pipeline · Cicero' };

export default async function PipelinePage() {
  const actor = await requireCurrentActor();
  const columns = await listPipeline(actor);
  return <PipelineBoard columns={columns.map(toColumnWire)} />;
}
