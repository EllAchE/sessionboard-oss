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

describe('DataTable column floors', () => {
  const sized = (
    specs: Array<{ width?: string; space?: DataTableColumnSpace }>,
  ): Array<DataTableColumn<Row>> =>
    specs.map((spec, index) => ({
      id: `column-${index}`,
      header: `Column ${index}`,
      width: spec.width,
      space: spec.space,
      render: (entry) => entry.title,
    }));

  it('holds a preferred width to the column floor', () => {
    const html = renderToStaticMarkup(
      <DataTable
        columns={sized([{ width: '10%', space: 'standard' }])}
        rows={[row]}
        getRowId={(entry) => entry.id}
      />,
    );

    expect(html).toContain('width:max(10%, 8rem)');
  });

  /**
   * A tenth of a narrow table is far under 8rem, but `max()` on the `<col>` already holds it there,
   * so the table needs no extra room on its account — only the floors it always owed.
   */
  it('counts a percentage column at its floor rather than its share', () => {
    const html = renderToStaticMarkup(
      <DataTable
        columns={sized([{ width: '10%', space: 'standard' }, { space: 'standard' }])}
        rows={[row]}
        getRowId={(entry) => entry.id}
      />,
    );

    expect(html).toContain('style="min-width:16rem"');
  });

  /**
   * A column declared in `px` above its own floor is worth the larger of the two, and every column
   * that declares no width at all is worth its floor.
   */
  it('counts a fixed column at whichever of its width and its floor is larger', () => {
    const html = renderToStaticMarkup(
      <DataTable
        columns={sized([
          { width: '140px', space: 'compact' },
          { width: '64px', space: 'compact' },
          { space: 'wide' },
        ])}
        rows={[row]}
        getRowId={(entry) => entry.id}
      />,
    );

    // 8.75rem for the 140px column, 6rem for the 64px one it floors, 12rem for the untouched wide.
    expect(html).toContain('style="min-width:26.75rem"');
  });

  /**
   * `SCORE` is the column the organizer submissions table exists to surface, and at 1280px it sat
   * off the right edge with no scrollbar: the eight columns summed to 63rem, which fits the content
   * area, so nothing overflowed — and `FORMAT` rendered at 9% of 63rem, 91px against a 128px floor.
   *
   * The floors alone come to 65.75rem here. The extra 3rem is the 16% column: at 65.75rem it
   * resolves above its floor and the surplus would come out of the auto title column, so the table
   * widens until 84% of it covers everything else. Solving 0.84w = 57.75 gives exactly 68.75rem —
   * 1100px, which overflows the organizer content area at 1280px and finally scrolls.
   */
  it('makes the organizer submissions table wide enough to overflow and scroll', () => {
    const html = renderToStaticMarkup(
      <DataTable
        columns={sized([
          { width: '92px', space: 'compact' },
          { space: 'wide' },
          { width: '16%' },
          { width: '10%' },
          { width: '9%' },
          { width: '140px', space: 'compact' },
          { width: '84px', space: 'compact' },
          { width: '92px', space: 'compact' },
        ])}
        rows={[row]}
        getRowId={(entry) => entry.id}
        selectionMode="multiple"
      />,
    );

    expect(html).toContain('style="min-width:68.75rem"');
  });

  it('ignores a width it cannot read as a percentage', () => {
    const html = renderToStaticMarkup(
      <DataTable
        columns={sized([{ width: 'min-content', space: 'compact' }])}
        rows={[row]}
        getRowId={(entry) => entry.id}
      />,
    );

    expect(html).toContain('style="min-width:6rem"');
  });
});
