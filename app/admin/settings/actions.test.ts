import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventContext, MembershipRole } from '@/lib/context';
import { conflict, invalid } from '@/lib/errors';

/**
 * One table edits all six taxonomies, so every row arrives as a string map and this file decides
 * what each column means. That parsing is the whole substance here, and its most breakable part is
 * the difference between "set this to nothing" and "do not mention this at all" — a null blanks a
 * column, an omission lets the service default stand.
 *
 * `requireCapability` is left real so the gate tests are not vacuous.
 */

const currentEventContext = vi.fn<() => Promise<EventContext>>();
const updateEvent = vi.fn();
const revalidatePath = vi.fn();
const settings = {
  createTrack: vi.fn(),
  createRoom: vi.fn(),
  createFormat: vi.fn(),
  createTag: vi.fn(),
  createPersona: vi.fn(),
  createFieldEntry: vi.fn(),
  updateTrack: vi.fn(),
  updateRoom: vi.fn(),
  updateFormat: vi.fn(),
  updateTag: vi.fn(),
  updatePersona: vi.fn(),
  updateFieldEntry: vi.fn(),
  removeTrack: vi.fn(),
  removeRoom: vi.fn(),
  removeFormat: vi.fn(),
  removeTag: vi.fn(),
  removePersona: vi.fn(),
  removeFieldEntry: vi.fn(),
  reorderTracks: vi.fn(),
  reorderRooms: vi.fn(),
  reorderFormats: vi.fn(),
  reorderPersonas: vi.fn(),
  saveNotificationPrefs: vi.fn(),
};

vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock('@/lib/services/events', () => ({
  currentEventContext: () => currentEventContext(),
  updateEvent: (...a: unknown[]) => updateEvent(...a),
}));
vi.mock('@/lib/services/settings', () => settings);

const actions = await import('./actions');

const ctxWith = (...roles: MembershipRole[]): EventContext => ({
  actor: {
    userId: 'user-organizer',
    email: 'organizer@forum.example',
    name: 'Organizer',
    impersonatedByUserId: null,
  },
  eventId: 'event-forum',
  roles,
});

beforeEach(() => {
  vi.resetAllMocks();
  currentEventContext.mockResolvedValue(ctxWith('organizer'));
  settings.saveNotificationPrefs.mockResolvedValue({ email: true, sms: false });
});

describe('the capability gate', () => {
  it('lets an organizer through and refreshes the settings page', async () => {
    expect(await actions.createRowAction('track', { name: 'Engineering' })).toEqual({
      ok: true,
      data: null,
    });
    expect(revalidatePath).toHaveBeenCalledWith('/admin/settings');
  });

  it('refuses a reviewer, who reads the taxonomy but does not configure it', async () => {
    currentEventContext.mockResolvedValue(ctxWith('reviewer'));

    expect(await actions.createRowAction('track', { name: 'Engineering' })).toEqual({
      ok: false,
      message: 'This action needs the event:manage permission',
    });
    expect(settings.createTrack).not.toHaveBeenCalled();
  });

  it('lets any organizer edit their own alert preferences without event:manage', async () => {
    // Deliberately ungated: these are the signed-in person's own notification rows, not event
    // configuration, so a reviewer edits their own without being able to touch the taxonomy.
    currentEventContext.mockResolvedValue(ctxWith('reviewer'));

    expect(await actions.saveMyNotificationPrefsAction({ email: false } as never)).toEqual({
      ok: true,
      data: { email: true, sms: false },
    });
    expect(settings.saveNotificationPrefs).toHaveBeenCalledWith('user-organizer', { email: false });
  });
});

describe('blank means nothing versus blank means unsaid', () => {
  it('blanks a nullable number when the box is cleared', async () => {
    await actions.createRowAction('room', { name: 'Curia', capacity: '' });

    expect(settings.createRoom.mock.calls[0][1]).toEqual({ name: 'Curia', capacity: null });
  });

  it('omits a defaulted number when the box is cleared, so the service default still wins', async () => {
    // `format.durationMinutes` defaults to 30 in the service. Sending null would blank it instead.
    await actions.createRowAction('format', { name: 'Oration', durationMinutes: '' });

    const input = settings.createFormat.mock.calls[0][1];
    expect(input).toEqual({ name: 'Oration' });
    expect('durationMinutes' in input).toBe(false);
  });

  it('parses a number that was actually given', async () => {
    await actions.createRowAction('room', { name: 'Curia', capacity: '120' });

    expect(settings.createRoom.mock.calls[0][1].capacity).toBe(120);
  });

  it('refuses a number that is not one, and names the field that was wrong', async () => {
    expect(await actions.createRowAction('room', { name: 'Curia', capacity: 'many' })).toEqual({
      ok: false,
      message: 'That is not a number',
      details: { capacity: 'Enter a number' },
    });
    expect(settings.createRoom).not.toHaveBeenCalled();
  });
});

describe('patching rather than blanking', () => {
  it('sends only the columns the caller actually mentioned', async () => {
    await actions.updateRowAction('track', 'track-1', { color: '#8a1c1c' });

    // `name` and `description` are untouched rather than overwritten with empty strings.
    expect(settings.updateTrack.mock.calls[0][2]).toEqual({ color: '#8a1c1c' });
  });

  it('ignores keys that do not belong to the kind being edited', async () => {
    await actions.createRowAction('tag', { name: 'Beginner', capacity: '40', nonsense: 'x' });

    expect(settings.createTag.mock.calls[0][1]).toEqual({ name: 'Beginner' });
  });

  it('keeps an explicitly emptied text column, which is a real change', async () => {
    await actions.updateRowAction('track', 'track-1', { description: '' });

    expect(settings.updateTrack.mock.calls[0][2]).toEqual({ description: '' });
  });
});

describe('list parsing', () => {
  it('splits custom field options on commas and newlines alike', async () => {
    await actions.createRowAction('field', {
      key: 'diet',
      label: 'Dietary needs',
      options: 'Vegan, Vegetarian\nHalal\n\n  Kosher  ,',
    });

    expect(settings.createFieldEntry.mock.calls[0][1].options).toEqual([
      'Vegan',
      'Vegetarian',
      'Halal',
      'Kosher',
    ]);
  });

  it('reads an empty option list as empty rather than one blank option', async () => {
    await actions.createRowAction('field', { key: 'diet', label: 'Diet', options: '  ' });

    expect(settings.createFieldEntry.mock.calls[0][1].options).toEqual([]);
  });
});

describe('reordering', () => {
  it('reorders the lists that have an order', async () => {
    await actions.reorderRowsAction('track', ['track-2', 'track-1']);
    expect(settings.reorderTracks).toHaveBeenCalledWith(expect.anything(), ['track-2', 'track-1']);

    await actions.reorderRowsAction('persona', ['persona-1']);
    expect(settings.reorderPersonas).toHaveBeenCalled();
  });

  it('refuses to reorder a list that has no order', async () => {
    expect(await actions.reorderRowsAction('tag', ['tag-1'])).toEqual({
      ok: false,
      message: 'That list has no order to change',
      details: undefined,
    });
  });
});

describe('removal', () => {
  it('passes the reassign target through so the delete stays lossless', async () => {
    await actions.removeRowAction('track', 'track-1', { reassignTo: 'track-2' } as never);

    expect(settings.removeTrack).toHaveBeenCalledWith(expect.anything(), 'track-1', {
      reassignTo: 'track-2',
    });
  });

  it('surfaces the service refusal that explains what is still using the row', async () => {
    settings.removeTrack.mockRejectedValue(
      conflict('12 sessions still use this track', { track: 'Reassign them first' }),
    );

    expect(await actions.removeRowAction('track', 'track-1')).toEqual({
      ok: false,
      message: '12 sessions still use this track',
      details: { track: 'Reassign them first' },
    });
  });
});

describe('the event itself', () => {
  /**
   * The start-before-end rule used to live in this action and now lives in `updateEvent`, which is
   * the right place for it — the action's own job is only to gate, forward and invalidate. So this
   * asserts the forwarding rather than re-testing a rule the service owns.
   */
  it('forwards the patch untouched, leaving the date rules to the service', async () => {
    const patch = { startsAt: '2026-09-10T09:00', endsAt: '2026-09-12T17:00' };

    expect(await actions.updateEventAction(patch)).toEqual({ ok: true, data: null });
    expect(updateEvent).toHaveBeenCalledWith(expect.anything(), patch);
  });

  it('surfaces the service refusal against the field that caused it', async () => {
    updateEvent.mockRejectedValue(
      invalid('The event ends before it starts', { endsAt: 'Must be on or after the start' }),
    );

    expect(
      await actions.updateEventAction({ startsAt: '2026-09-10T09:00', endsAt: '2026-09-08T17:00' }),
    ).toEqual({
      ok: false,
      message: 'The event ends before it starts',
      details: { endsAt: 'Must be on or after the start' },
    });
  });

  it('refreshes the dashboard as well as settings, since the event header sits there', async () => {
    await actions.updateEventAction({ name: 'The Forum' });

    expect(revalidatePath).toHaveBeenCalledWith('/admin/settings');
    expect(revalidatePath).toHaveBeenCalledWith('/admin');
  });
});

describe('error translation', () => {
  it('hides an unexpected failure behind a generic message', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    settings.createTrack.mockRejectedValue(new Error('connection terminated'));

    expect(await actions.createRowAction('track', { name: 'Engineering' })).toEqual({
      ok: false,
      message: 'Something went wrong. Try again.',
    });
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
