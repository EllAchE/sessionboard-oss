import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui';
import { ContentHistory, type EntityWire } from './ContentHistory';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => '/organizer/submissions/files/history',
}));

const SESSION: EntityWire = {
  kind: 'session',
  id: 'sub-1',
  label: 'ABS-1 Taming 40-Minute CI',
  secondary: 'accepted',
  fields: { title: 'ABS-1 Taming 40-Minute CI', level: '', descriptionMarkdown: '' },
  contentStatus: 'approved',
};

const SPEAKER: EntityWire = {
  kind: 'participant',
  id: 'part-1',
  label: 'Priya Raman',
  secondary: 'priya@example.com',
  fields: { displayName: 'Priya Raman', jobTitle: '', company: '', bioMarkdown: '' },
  contentStatus: null,
};

const LABELS = {
  session: { title: 'Title', level: 'Level', descriptionMarkdown: 'Description' },
  participant: { displayName: 'Name', jobTitle: 'Job title', company: 'Company', bioMarkdown: 'Bio' },
  scheduled_session: {},
  sponsor: {},
};

function render(entities: EntityWire[]): string {
  return renderToStaticMarkup(
    <ToastProvider>
      <ContentHistory entities={entities} revisions={[]} fieldLabels={LABELS} />
    </ToastProvider>,
  );
}

/** Everything a screen reader gets from an attribute rather than from the page's text. */
function visibleTextOnly(html: string): string {
  return html.replace(/\s(?:aria-label|title|alt|placeholder)="[^"]*"/g, '');
}

/**
 * `CNT-S3`. This is the only surface carrying the content-approval control, and every row that had
 * one showed a status chip and a dropdown and no session name at all — the identity survived only
 * in the dropdown's accessible name. An organizer was being asked to approve or reject four rows
 * without being able to see which sessions they were.
 *
 * The cause was layout: a `Select` wrapper is `width: 100%`, and as a flex sibling of a name that
 * sets `min-width: 0` in order to ellipsize, it took the row and the name gave. Rows with no
 * approval control — the speakers in the same list — were unaffected, which is what made it look
 * like missing data rather than a squeeze.
 */
describe('approval and content rows', () => {
  it('shows the session name as text on the page, not only to a screen reader', () => {
    expect(visibleTextOnly(render([SESSION]))).toContain('ABS-1 Taming 40-Minute CI');
  });

  it('keeps the approval control off the name’s line', () => {
    const html = render([SESSION]);
    const row = html.slice(html.indexOf('entityRow'));

    // The select is inside the status container rather than a sibling of the name.
    expect(row).toContain('entityStatus');
    expect(row.indexOf('entityStatus')).toBeLessThan(row.indexOf('<select'));
    expect(row.indexOf('entityName')).toBeLessThan(row.indexOf('entityStatus'));
  });

  it('still labels the control with the session it belongs to', () => {
    expect(render([SESSION])).toContain('Content approval for ABS-1 Taming 40-Minute CI');
  });

  /** A speaker has no approval control, so the row is a name and nothing else. */
  it('leaves a row without an approval status as just the name', () => {
    const html = render([SPEAKER]);

    expect(visibleTextOnly(html)).toContain('Priya Raman');
    expect(html.slice(html.indexOf('entityRow'))).not.toContain('entityStatus');
  });

  it('names every entity in the list, not only the selected one', () => {
    const text = visibleTextOnly(render([SESSION, SPEAKER]));

    expect(text).toContain('ABS-1 Taming 40-Minute CI');
    expect(text).toContain('Priya Raman');
  });
});
