import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui';

/**
 * `createEventAction` reaches for `next/headers` and the database the moment it is imported, so the
 * module is stubbed here: what this file is about is the browser half of the create, not the
 * server half, which `app/organizer/shell-actions.test.ts` covers.
 */
vi.mock('@/app/organizer/shell-actions', () => ({ createEventAction: vi.fn() }));

const { createEventFeedback, NewEventForm } = await import('./NewEventForm');

(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe('what a submit draws', () => {
  it('says nothing at all when the create worked', () => {
    // The action redirects on success, so it settles with nothing. Reading `.details` off that is
    // what used to throw, and announcing it is what used to call a created event a failure.
    expect(createEventFeedback(undefined)).toEqual({ errors: {}, toast: null });
  });

  it('marks the field the service named and warns once', () => {
    expect(
      createEventFeedback({
        ok: false,
        message: 'The URL /cascadia-2026 is already taken',
        details: { slug: 'Already in use' },
      }),
    ).toEqual({
      errors: { slug: 'Already in use' },
      toast: { title: 'The URL /cascadia-2026 is already taken', tone: 'danger' },
    });
  });

  it('still warns when a failure names no field, without inventing one', () => {
    expect(createEventFeedback({ ok: false, message: 'Something went wrong. Try again.' })).toEqual({
      errors: {},
      toast: { title: 'Something went wrong. Try again.', tone: 'danger' },
    });
  });
});

describe('the form itself', () => {
  it('opens on the computed window rather than on empty date boxes', () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <NewEventForm
          defaultStartsAt="2026-09-27T09:00"
          defaultEndsAt="2026-09-27T17:00"
          defaultTimezone="America/Los_Angeles"
        />
      </ToastProvider>,
    );

    expect(html).toContain('value="2026-09-27T09:00"');
    expect(html).toContain('value="2026-09-27T17:00"');
    expect(html).toContain('value="America/Los_Angeles"');
    expect(html).toContain('Create event');
    expect(html).toContain('Leave blank to derive it from the name.');
  });
});
