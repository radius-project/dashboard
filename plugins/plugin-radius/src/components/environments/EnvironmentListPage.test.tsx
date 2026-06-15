import React from 'react';
import { EnvironmentListPage } from './EnvironmentListPage';
import { screen } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { RadiusApi } from '../../api';
import { radiusApiRef } from '../../plugin';
import { EnvironmentProperties, ResourceList } from '../../resources';

describe('EnvironmentListPage', () => {
  // Rendering an empty table is fine for now, we have good unit tests for the
  // table logic elsewhere.
  it('should render table', async () => {
    const api: Pick<RadiusApi, 'listResources'> = {
      listResources: async <T = EnvironmentProperties,>() =>
        Promise.resolve<ResourceList<T>>({
          value: [],
        }),
    };

    await renderInTestApp(
      <TestApiProvider apis={[[radiusApiRef, api]]}>
        <EnvironmentListPage />
      </TestApiProvider>,
    );
    expect(
      screen.getByText(
        'Displaying environments where applications can be deployed.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();

    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();

    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(2); // Header + empty row
    const [header] = rows;

    // Verify correct headings (we had headings that will never be shown for an environment)
    const expectedColumns = ['Name', 'Resource Group', 'Kind'];
    const headings = header.querySelectorAll('th');
    expect(headings).toHaveLength(expectedColumns.length);
    headings.forEach((heading, index) => {
      expect(heading).toHaveTextContent(expectedColumns[index]);
    });
  });
});
