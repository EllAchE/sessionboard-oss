import { notFound } from 'next/navigation';
import { requireCurrentActor } from '@/lib/auth';
import { PROSPECT_STAGES, STAGE_LABELS, getProspectDetail } from '@/lib/services/crm';
import { ProspectDetail } from './ProspectDetail';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Prospect · Cicero' };

export default async function ProspectPage({
  params,
}: {
  params: Promise<{ prospectId: string }>;
}) {
  const actor = await requireCurrentActor();
  const { prospectId } = await params;

  const detail = await getProspectDetail(actor, prospectId).catch(() => null);
  if (!detail) notFound();

  return (
    <ProspectDetail
      prospect={{
        id: detail.card.id,
        contactId: detail.card.contactId,
        stage: detail.card.stage,
        stageLabel: STAGE_LABELS[detail.card.stage],
        score: detail.card.score,
        rationale: detail.card.rationale,
        eventName: detail.eventName,
        createdAt: detail.card.createdAt.toISOString(),
      }}
      contact={{
        id: detail.contact.id,
        name: detail.contact.name,
        email: detail.contact.email,
        company: detail.contact.company,
        jobTitle: detail.contact.jobTitle,
      }}
      stages={PROSPECT_STAGES.map((stage) => ({
        stage,
        label: STAGE_LABELS[stage],
      }))}
      notes={detail.notes.map((note) => ({
        id: note.id,
        authorName: note.authorName,
        body: note.bodyMarkdown,
        createdAt: note.createdAt.toISOString(),
      }))}
      history={detail.history.map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        summary: entry.summary,
        actorName: entry.actorName,
        createdAt: entry.createdAt.toISOString(),
      }))}
    />
  );
}
