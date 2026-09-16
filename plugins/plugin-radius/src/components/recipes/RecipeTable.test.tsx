import React from 'react';
import { renderInTestApp } from '@backstage/test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecipeTable } from './RecipeTable';
import { DisplayRecipe } from './recipeAggregation';

/**
 * `RecipeTable` renders the already-aggregated display rows. The aggregation
 * has unit tests; the table did not, so nothing pinned the column set, the
 * column order, or the fact that sorting is on while search and paging are off.
 * Those three options are the difference between a usable recipe list and one
 * that truncates at twenty rows, which is a change a reviewer would not see.
 *
 * Reading rows: Material Table renders the header as `<th>` and the body as
 * `<tbody><tr><td>`, so the assertions below read cells positionally rather
 * than by whole-page text, which would also match the header.
 */
const recipe = (overrides: Partial<DisplayRecipe> = {}): DisplayRecipe => ({
  recipePack: 'demo-pack',
  type: 'Radius.Data/redisCaches',
  kind: 'bicep',
  source: 'ghcr.io/radius-project/recipes/redis:latest',
  ...overrides,
});

const bodyRows = (): string[][] =>
  Array.from(document.querySelectorAll('tbody tr')).map(row =>
    Array.from(row.querySelectorAll('td')).map(
      cell => cell.textContent?.trim() ?? '',
    ),
  );

describe('RecipeTable', () => {
  it('RK-01: renders the four columns in the documented order', async () => {
    await renderInTestApp(<RecipeTable recipes={[recipe()]} />);

    expect(
      screen.getAllByRole('columnheader').map(header => header.textContent),
    ).toEqual(['Recipe Pack', 'Resource Type', 'Kind', 'Source']);
  });

  it('RK-02: renders one row per recipe', async () => {
    await renderInTestApp(
      <RecipeTable
        recipes={[
          recipe({ type: 'Radius.Data/redisCaches' }),
          recipe({ type: 'Radius.Data/postgresDatabases' }),
        ]}
      />,
    );

    expect(bodyRows()).toHaveLength(2);
  });

  it('RK-03: puts each field in its own column', async () => {
    await renderInTestApp(<RecipeTable recipes={[recipe()]} />);

    expect(bodyRows()[0]).toEqual([
      'demo-pack',
      'Radius.Data/redisCaches',
      'bicep',
      'ghcr.io/radius-project/recipes/redis:latest',
    ]);
  });

  it('RK-04: renders a blank Recipe Pack cell for a legacy inline recipe', async () => {
    // Legacy `Applications.Core/environments` carry recipes inline and have no
    // pack, so the aggregation emits an empty string rather than omitting the
    // row. The table must render the row, not drop it.
    await renderInTestApp(
      <RecipeTable recipes={[recipe({ recipePack: '' })]} />,
    );

    expect(bodyRows()).toHaveLength(1);
    expect(bodyRows()[0][0]).toBe('');
  });

  it('RK-05: shows an empty-state message rather than a bare header when there are no recipes', async () => {
    await renderInTestApp(<RecipeTable recipes={[]} />);

    expect(bodyRows()).toHaveLength(1);
    expect(bodyRows()[0].join(' ')).toMatch(/No records to display/i);
  });

  it('RK-06: renders the optional title when the caller supplies one', async () => {
    await renderInTestApp(
      <RecipeTable recipes={[recipe()]} title="Recipes for demo-env" />,
    );

    expect(screen.getByText('Recipes for demo-env')).toBeInTheDocument();
  });

  it('RK-07: renders an empty title slot when the caller does not supply one', async () => {
    await renderInTestApp(<RecipeTable recipes={[recipe()]} />);

    // `Table` always renders the heading element, so the absence of a title is
    // an empty heading rather than no heading. Asserting `queryByRole` is null
    // here would fail against correct behavior.
    const heading = screen.getByRole('heading');

    expect(heading.textContent).toBe('');
  });

  it('RK-08: offers no search box, because filtering is done by the page above it', async () => {
    await renderInTestApp(<RecipeTable recipes={[recipe()]} />);

    expect(screen.queryByPlaceholderText(/search/i)).toBeNull();
  });

  it('RK-09: pages nothing, so a large environment shows every recipe', async () => {
    const many = Array.from({ length: 30 }, (_unused, index) =>
      recipe({ type: `Radius.Data/type${index}` }),
    );

    await renderInTestApp(<RecipeTable recipes={many} />);

    expect(bodyRows()).toHaveLength(30);
    expect(screen.queryByRole('button', { name: /next page/i })).toBeNull();
  });

  it('RK-10: sorts by a column when its header is activated', async () => {
    await renderInTestApp(
      <RecipeTable
        recipes={[
          recipe({ type: 'zeta', recipePack: 'p1' }),
          recipe({ type: 'alpha', recipePack: 'p2' }),
        ]}
      />,
    );

    expect(bodyRows().map(row => row[1])).toEqual(['zeta', 'alpha']);

    await userEvent.click(screen.getByText('Resource Type'));

    expect(bodyRows().map(row => row[1])).toEqual(['alpha', 'zeta']);
  });
});
