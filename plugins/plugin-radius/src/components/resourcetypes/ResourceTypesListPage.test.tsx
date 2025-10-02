import React from 'react';
import { ResourceTypesListPage } from './ResourceTypesListPage';
import { screen } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { RadiusApi } from '../../api';
import { radiusApiRef } from '../../plugin';
import { ResourceList } from '../../resources';

describe('ResourceTypesListPage', () => {
  // Rendering an empty table is fine for now, we have good unit tests for the
  // table logic elsewhere.
  it('should render table', async () => {
    const api: Pick<RadiusApi, 'listResourceTypes'> = {
      listResourceTypes: async () =>
        Promise.resolve<
          ResourceList<{
            namespace: string;
            type: string;
            apiVersion: string;
            apiVersions?: string[];
          }>
        >({
          value: [],
        }),
    };

    await renderInTestApp(
      <TestApiProvider apis={[[radiusApiRef, api]]}>
        <ResourceTypesListPage />
      </TestApiProvider>,
    );
    expect(
      screen.getByText('Resource types available for building applications.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();

    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();

    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(2); // Header + empty row
    const [header] = rows;

    // Verify correct headings
    const expectedColumns = ['Type', 'Namespace', 'API Versions'];
    const headings = header.querySelectorAll('th');
    expect(headings).toHaveLength(expectedColumns.length);
    headings.forEach((heading, index) => {
      expect(heading).toHaveTextContent(expectedColumns[index]);
    });
  });
});
