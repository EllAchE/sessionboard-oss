import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { formatChordString } from '@/lib/hotkeys/match';
import { SCOPES, getBinding } from '@/lib/hotkeys/registry';
import { ShortcutList } from './InfoPanel';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const render = () =>
  renderToStaticMarkup(<ShortcutList onOpenCommand={vi.fn()} onOpenShortcuts={vi.fn()} />);

/** No provider is mounted here, so the caps render in the pre-hydration spelling: Ctrl, not ⌘. */
const caps = (bindingId: string) =>
  formatChordString(getBinding(SCOPES.organizerGlobal, bindingId)?.chords[0] ?? '', 'other');

describe('organizer info shortcuts', () => {
  /**
   * The panel used to spell its own caps out, and by the time the workspace was rebound it was
   * advertising `?` for a key that had become ⌘⌃/. Asserting against the registry rather than
   * against the caps means this test moves with the next rebind instead of having to be rewritten
   * after it.
   */
  it('reads both advertised hotkeys off the registry', () => {
    const html = render();

    expect(html).toContain('Search and jump');
    for (const cap of caps('command-palette')) expect(html).toContain(`>${cap}<`);
    expect(html).toContain('Close an open panel');
    expect(html).toContain('Esc');
  });

  it('points at the generated overlay rather than listing the shortcuts itself', () => {
    const html = render();

    expect(html).toContain('See every shortcut');
    for (const cap of caps('shortcuts-help')) expect(html).toContain(`>${cap}<`);
  });

  it('spells the caps for a screen reader, which cannot pronounce a glyph', () => {
    expect(render()).toContain('aria-label="Control Alt Slash"');
  });
});
