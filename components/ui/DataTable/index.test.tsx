import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DataTable, type DataTableColumn, type DataTableColumnSpace } from '.';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

type Row = { id: string; title: string };

const row: Row = { id: 'one', title: 'One' };

function columns(
  count: number,
  spaces: DataTableColumnSpace[] = [],
): Array<DataTableColumn<Row>> {
  return Array.from({ length: count }, (_, index) => ({
    id: `column-${index}`,
    header: `Column ${index}`,
    space: spaces[index],
    render: (entry) => entry.title,
  }));
}

describe('DataTable responsive width', () => {
  it('derives a readable minimum width from the number of rendered columns', () => {
    const html = renderToStaticMarkup(
      <DataTable columns={columns(5)} rows={[row]} getRowId={(entry) => entry.id} />,
    );

    expect(html).toContain('style="min-width:40rem"');
  });

  it('uses compact and wide space according to the column content', () => {
    const html = renderToStaticMarkup(
      <DataTable
        columns={columns(3, ['compact', 'standard', 'wide'])}
        rows={[row]}
        getRowId={(entry) => entry.id}
      />,
    );

    expect(html).toContain('style="min-width:26rem"');
  });

  it('reserves space for a selection column', () => {
    const html = renderToStaticMarkup(
      <DataTable
        columns={columns(3, ['compact', 'standard', 'wide'])}
        rows={[row]}
        getRowId={(entry) => entry.id}
        selectionMode="multiple"
      />,
    );

    expect(html).toContain('style="min-width:29rem"');
  });

  it('allows a denser or wider table to override the inferred minimum', () => {
    const html = renderToStaticMarkup(
      <DataTable
        columns={columns(2)}
        rows={[row]}
        getRowId={(entry) => entry.id}
        minWidth="36rem"
      />,
    );

    expect(html).toContain('style="min-width:36rem"');
  });
});
