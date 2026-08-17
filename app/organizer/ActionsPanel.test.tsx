import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ariaKeyshortcuts } from '@/lib/hotkeys/match';
import { SCOPES, getBinding } from '@/lib/hotkeys/registry';
import { ActionsList, actionRows } from './ActionsPanel';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const handlers = { onOpenCommand: vi.fn(), onOpenShortcuts: vi.fn() };

/**
 * The panel's promise is that every row it offers can also be reached from the keyboard, so the
 * test is about that correspondence rather than about the copy: each row names a binding, and the
 * rendered row carries the keystroke that binding fires.
 */
describe('organizer actions panel', () => {
  it('gives every row a binding that actually exists', () => {
    for (const row of actionRows('spring-summit')) {
      const binding = getBinding(SCOPES.organizerGlobal, row.bindingId);
      expect(binding, `${row.label} names a binding nothing declares`).toBeDefined();
      expect(binding?.chords.length, `${row.label} has a binding with no keys`).toBeGreaterThan(0);
    }
  });

  it('says which key each row maps to', () => {
    const html = renderToStaticMarkup(
      <ActionsList currentEventSlug="spring-summit" {...handlers} />,
    );

    // ⌘⌃N for the new event form, ⌘⌃V for the portal, and so on — announced in both keyboards'
    // spelling, because the matcher answers to both and this markup renders before either is known.
    for (const row of actionRows('spring-summit')) {
      const binding = getBinding(SCOPES.organizerGlobal, row.bindingId);
      expect(html, `${row.label} does not advertise its shortcut`).toContain(
        `aria-keyshortcuts="${ariaKeyshortcuts(binding?.chords[0] ?? '')}"`,
      );
    }
  });

  it('offers the moves the sidebar does not', () => {
    const html = renderToStaticMarkup(
      <ActionsList currentEventSlug="spring-summit" {...handlers} />,
    );

    expect(html).toContain('Search and jump');
    expect(html).toContain('Create an event');
    expect(html).toContain('Speaker portal');
    expect(html).toContain('href="/spring-summit"');
    expect(html).toContain('See every shortcut');
  });

  it('drops the public programme row when there is no event to preview', () => {
    const rows = actionRows(undefined).map((row) => row.bindingId);

    expect(rows).not.toContain('goto-public');
    expect(rows).toContain('goto-overview');
  });
});
