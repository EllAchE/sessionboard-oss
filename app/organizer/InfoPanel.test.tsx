import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ShortcutList } from './InfoPanel';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe('organizer info shortcuts', () => {
  it('keeps both advertised hotkeys in the dedicated Info view', () => {
    const html = renderToStaticMarkup(
      <ShortcutList onOpenCommand={vi.fn()} onOpenShortcuts={vi.fn()} />,
    );

    expect(html).toContain('Search and jump');
    expect(html).toContain('Command or Control K');
    expect(html).toContain('⌘ / Ctrl');
    expect(html).toContain('Close an open panel');
    expect(html).toContain('Esc');
  });

  it('points at the generated overlay rather than listing the shortcuts itself', () => {
    const html = renderToStaticMarkup(
      <ShortcutList onOpenCommand={vi.fn()} onOpenShortcuts={vi.fn()} />,
    );

    expect(html).toContain('See every shortcut');
  });
});
