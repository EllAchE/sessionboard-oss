import { requireCurrentActor } from '@/lib/auth';
import { forbidden } from '@/lib/errors';
import { listOrganizerEvents } from '@/lib/services/crm';

export async function requireCrmOrganizer() {
  const actor = await requireCurrentActor();
  const events = await listOrganizerEvents(actor);
  if (events.length === 0) throw forbidden('Only organizers can manage the speaker CRM');
  return actor;
}
