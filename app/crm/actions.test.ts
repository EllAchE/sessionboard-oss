import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '@/lib/context';
import { conflict, forbidden } from '@/lib/errors';

/**
 * Every CRM mutation. The file is uniform — resolve the actor, call the service, invalidate, return
 * a result — so the risk is not in any one branch but in the invalidation fan-out, which is silent
 * when it is wrong: a contact edited on one screen and stale on four others looks like a data bug
 * for a long time before anyone suspects the cache.
 *
 * These are cross-event surfaces, so they authenticate rather than resolve an event context.
 */

const requireCrmOrganizer = vi.fn<() => Promise<Actor>>();
const revalidatePath = vi.fn<(path: string) => void>();
const crm = {
  createContact: vi.fn(),
  updateContact: vi.fn(),
  addNote: vi.fn(),
  createField: vi.fn(),
  deleteField: vi.fn(),
  createSegment: vi.fn(),
  deleteSegment: vi.fn(),
  mergeContacts: vi.fn(),
  enrollProspect: vi.fn(),
  moveProspect: vi.fn(),
  removeProspect: vi.fn(),
  pushContactToEvent: vi.fn(),
  sendCampaign: vi.fn(),
  previewImport: vi.fn(),
  importContacts: vi.fn(),
  loadSampleContacts: vi.fn(),
};

vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
vi.mock('./context', () => ({ requireCrmOrganizer: () => requireCrmOrganizer() }));
vi.mock('@/lib/services/crm', () => crm);

const actions = await import('./actions');

const ACTOR: Actor = {
  userId: 'user-organizer',
  email: 'organizer@forum.example',
  name: 'Organizer',
  impersonatedByUserId: null,
};

/** The five directory screens any contact-shaped write can change. */
const DIRECTORY = ['/crm', '/crm/dashboard', '/crm/segments', '/crm/duplicates', '/crm/pipeline'];

const invalidated = () => revalidatePath.mock.calls.map(([path]) => path);

beforeEach(() => {
  vi.resetAllMocks();
  requireCrmOrganizer.mockResolvedValue(ACTOR);
  crm.createContact.mockResolvedValue({ id: 'contact-1' });
  crm.mergeContacts.mockResolvedValue({ id: 'contact-primary' });
  crm.enrollProspect.mockResolvedValue({ id: 'prospect-1' });
  crm.pushContactToEvent.mockResolvedValue({ eventName: 'The Forum', created: true });
  crm.sendCampaign.mockResolvedValue({ sent: 12, failed: 1 });
  crm.previewImport.mockResolvedValue({ rows: [] });
  crm.importContacts.mockResolvedValue({ created: 4 });
  crm.loadSampleContacts.mockResolvedValue({ created: 20 });
});

describe('the organizer gate', () => {
  it('refuses a non-organizer before the mutation reaches the service', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    requireCrmOrganizer.mockRejectedValue(forbidden('Only organizers can manage the speaker CRM'));

    expect(await actions.createContactAction({} as never)).toEqual({
      ok: false,
      error: 'Only organizers can manage the speaker CRM',
    });
    expect(crm.createContact).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    logged.mockRestore();
  });

  it('passes the resolved actor to the service rather than an id from the caller', async () => {
    await actions.createContactAction({ email: 'brutus@forum.example' } as never);

    expect(crm.createContact).toHaveBeenCalledWith(ACTOR, { email: 'brutus@forum.example' });
  });
});

describe('error translation', () => {
  it('surfaces a service refusal in its own words', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    crm.mergeContacts.mockRejectedValue(conflict('Those contacts are already merged'));

    expect(await actions.mergeContactsAction({} as never)).toEqual({
      ok: false,
      error: 'Those contacts are already merged',
    });
    logged.mockRestore();
  });

  it('generalises an unexpected failure rather than leaking it', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    crm.importContacts.mockRejectedValue(new Error('relation "crm_contact" does not exist'));

    const result = await actions.importContactsAction('a,b', {} as never);

    expect(result).toEqual({ ok: false, error: 'Something went wrong' });
    expect(JSON.stringify(result)).not.toContain('crm_contact');
    logged.mockRestore();
  });
});

describe('directory invalidation', () => {
  it('refreshes every directory screen after a contact is created', async () => {
    await actions.createContactAction({} as never);

    for (const path of DIRECTORY) expect(invalidated()).toContain(path);
  });

  it('also refreshes the contact being edited', async () => {
    await actions.updateContactAction('contact-1', {});

    for (const path of DIRECTORY) expect(invalidated()).toContain(path);
    expect(invalidated()).toContain('/crm/contact-1');
  });

  it('refreshes the merged-into contact, not the ones that were absorbed', async () => {
    await actions.mergeContactsAction({ primaryId: 'contact-primary', loserIds: ['contact-2'] } as never);

    expect(invalidated()).toContain('/crm/contact-primary');
  });

  it('refreshes the directory after a bulk import and after the sample load', async () => {
    await actions.importContactsAction('a,b', {} as never);
    for (const path of DIRECTORY) expect(invalidated()).toContain(path);

    vi.resetAllMocks();
    requireCrmOrganizer.mockResolvedValue(ACTOR);
    crm.loadSampleContacts.mockResolvedValue({ created: 20 });
    await actions.loadSampleContactsAction();
    for (const path of DIRECTORY) expect(invalidated()).toContain(path);
  });
});

describe('reads do not invalidate', () => {
  it('previews an import without refreshing anything', async () => {
    expect(await actions.previewImportAction('a,b')).toEqual({ ok: true, data: { rows: [] } });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(crm.importContacts).not.toHaveBeenCalled();
  });

  it('runs the same mapping the import will run', async () => {
    const mapping = { email: 'Email' } as never;
    await actions.previewImportAction('a,b', mapping);

    expect(crm.previewImport).toHaveBeenCalledWith(ACTOR, 'a,b', mapping);
  });
});

describe('notes', () => {
  it('refreshes the contact, and the prospect too when the note was left on one', async () => {
    await actions.addNoteAction({ contactId: 'contact-1', prospectId: 'prospect-1', body: 'Called' });

    expect(invalidated()).toContain('/crm/contact-1');
    expect(invalidated()).toContain('/crm/pipeline/prospect-1');
  });

  it('refreshes only the contact when the note belongs to no prospect', async () => {
    await actions.addNoteAction({ contactId: 'contact-1', prospectId: null, body: 'Called' });

    expect(invalidated()).toEqual(['/crm/contact-1']);
  });
});

describe('the pipeline', () => {
  it('refreshes the board, the contact and the dashboard when a prospect is enrolled', async () => {
    await actions.enrollProspectAction({ contactId: 'contact-1' } as never);

    expect(invalidated()).toEqual(
      expect.arrayContaining(['/crm/pipeline', '/crm/contact-1', '/crm/dashboard']),
    );
  });

  it('refreshes the moved prospect itself as well as the board', async () => {
    await actions.moveProspectAction({ prospectId: 'prospect-1', stage: 'won' } as never);

    expect(invalidated()).toEqual(
      expect.arrayContaining(['/crm/pipeline', '/crm/pipeline/prospect-1', '/crm/dashboard']),
    );
  });

  it('refreshes only the board when a prospect is removed, since its page is gone', async () => {
    await actions.removeProspectAction('prospect-1');

    expect(invalidated()).toEqual(['/crm/pipeline']);
  });
});

describe('crossing into the event', () => {
  it('refreshes the admin speaker roster, which the push just changed', async () => {
    // Easy to forget: this write lands outside /crm, so only invalidating CRM screens would leave
    // the roster stale.
    await actions.pushToEventAction({ contactId: 'contact-1', eventId: 'event-forum' });

    expect(invalidated()).toContain('/admin/speakers');
    expect(invalidated()).toContain('/crm/contact-1');
  });

  it('reports whether the push created someone or matched an existing speaker', async () => {
    crm.pushContactToEvent.mockResolvedValue({ eventName: 'The Forum', created: false });

    expect(await actions.pushToEventAction({ contactId: 'contact-1', eventId: 'event-forum' })).toEqual({
      ok: true,
      data: { eventName: 'The Forum', created: false },
    });
  });
});

describe('campaigns', () => {
  it('returns the counts of a partly failed send', async () => {
    expect(
      await actions.sendCampaignAction({ subject: 'Hello', bodyMarkdown: '', contactIds: [], eventId: null }),
    ).toEqual({ ok: true, data: { sent: 12, failed: 1 } });
    expect(invalidated()).toContain('/crm/campaigns');
  });
});
