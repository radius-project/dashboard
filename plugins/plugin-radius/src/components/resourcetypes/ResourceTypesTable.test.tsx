import React from 'react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { screen, waitFor } from '@testing-library/react';
import { RadiusApi } from '../../api';
import { radiusApiRef } from '../../plugin';
import { ResourceTypesTable } from './ResourceTypesTable';
import { resourceTypeDetailPageRouteRef } from '../../routes';

type RT = {
  id: string;
  name: string;
  type: string;
  systemData: Record<string, never>;
  properties: {
    namespace: string;
    type: string;
    apiVersion: string;
    apiVersions?: string[];
  };
};

describe('ResourceTypesTable', () => {
  it('should display loading indicator while loading', async () => {
    // This is the boilerplate for an unresolved promise.
    const deferred: ((resolve: { value: RT[] }) => void)[] = [];
    const api: Pick<RadiusApi, 'listResourceTypes'> = {
      listResourceTypes: async () =>
        new Promise<{ value: RT[] }>(resolve => {
          deferred.push(resolve);
        }),
    };

    await renderInTestApp(
      <TestApiProvider apis={[[radiusApiRef, api]]}>
        <ResourceTypesTable title="Testing" />
      </TestApiProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('progress')).toBeInTheDocument();
    });

    // "Complete" the loading of resource types.
    deferred[0]({
      value: [],
    });

    await waitFor(() => {
      expect(screen.queryByTestId('progress')).toBeNull();
    });

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
  });

  it('should display error message when loading fails', async () => {
    const api: Pick<RadiusApi, 'listResourceTypes'> = {
      listResourceTypes: async () => Promise.reject(new Error('Oh noes!')),
    };

    await renderInTestApp(
      <TestApiProvider apis={[[radiusApiRef, api]]}>
        <ResourceTypesTable title="Testing" />
      </TestApiProvider>,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent('Oh noes!');
  });

  it('should render empty table', async () => {
    const api: Pick<RadiusApi, 'listResourceTypes'> = {
      listResourceTypes: async () =>
        Promise.resolve({
          value: [],
        }),
    };

    await renderInTestApp(
      <TestApiProvider apis={[[radiusApiRef, api]]}>
        <ResourceTypesTable title="Testing" />
      </TestApiProvider>,
    );
    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();
  });

  it('should render table with items', async () => {
    const api: Pick<RadiusApi, 'listResourceTypes'> = {
      listResourceTypes: async () =>
        Promise.resolve<{ value: RT[] }>({
          value: [
            {
              id: '/planes/radius/local/providers/System.Resources/resourceproviders/Custom.Database',
              name: 'Custom.Database',
              type: 'System.Resources/resourceproviders',
              systemData: {},
              properties: {
                namespace: 'Custom.Database',
                type: 'mongoDatabases',
                apiVersion: '2023-10-01-preview',
                apiVersions: ['2023-10-01-preview'],
              },
            },
            {
              id: '/planes/radius/local/providers/System.Resources/resourceproviders/Custom.Compute',
              name: 'Custom.Compute',
              type: 'System.Resources/resourceproviders',
              systemData: {},
              properties: {
                namespace: 'Custom.Compute',
                type: 'containers',
                apiVersion: '2023-10-01-preview\n2024-01-01-preview',
                apiVersions: ['2023-10-01-preview', '2024-01-01-preview'],
              },
            },
          ],
        }),
    };

    await renderInTestApp(
      <TestApiProvider apis={[[radiusApiRef, api]]}>
        <ResourceTypesTable title="Resource Types" />
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/resource-types/:namespace/:typeName':
            resourceTypeDetailPageRouteRef,
        },
      },
    );

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    const table = screen.getByRole('table');
    const rows = table.querySelectorAll('tbody > tr');

    // Should have 2 data rows
    expect(rows).toHaveLength(2);
    const [row1, row2] = rows;

    // Verify correct headings
    const expectedColumns = ['Type', 'Namespace', 'API Versions'];
    const headings = table.querySelectorAll('thead th');
    expect(headings).toHaveLength(expectedColumns.length);
    headings.forEach((heading, index) => {
      expect(heading).toHaveTextContent(expectedColumns[index]);
    });

    // Verify first row data
    const row1Cells = row1.querySelectorAll('td');
    expect(row1Cells).toHaveLength(expectedColumns.length);
    expect(row1Cells[0]).toHaveTextContent('mongoDatabases');
    expect(row1Cells[1]).toHaveTextContent('Custom.Database');
    expect(row1Cells[2]).toHaveTextContent('2023-10-01-preview');

    // Verify second row data
    const row2Cells = row2.querySelectorAll('td');
    expect(row2Cells).toHaveLength(expectedColumns.length);
    expect(row2Cells[0]).toHaveTextContent('containers');
    expect(row2Cells[1]).toHaveTextContent('Custom.Compute');
    expect(row2Cells[2]).toHaveTextContent(
      '2023-10-01-preview 2024-01-01-preview',
    );

    // Verify that the type is a clickable link
    const typeLink = row1Cells[0].querySelector('a');
    expect(typeLink).toBeInTheDocument();
    expect(typeLink).toHaveAttribute(
      'href',
      '/resource-types/Custom.Database/mongoDatabases',
    );
  });

  it('should filter out system namespaces by default', async () => {
    const api: Pick<RadiusApi, 'listResourceTypes'> = {
      listResourceTypes: async () =>
        Promise.resolve<{ value: RT[] }>({
          value: [
            {
              id: '/planes/radius/local/providers/System.Resources/resourceproviders/Custom.Database',
              name: 'Custom.Database',
              type: 'System.Resources/resourceproviders',
              systemData: {},
              properties: {
                namespace: 'Custom.Database',
                type: 'mongoDatabases',
                apiVersion: '2023-10-01-preview',
                apiVersions: ['2023-10-01-preview'],
              },
            },
            {
              id: '/planes/radius/local/providers/System.Resources/resourceproviders/Applications.Core',
              name: 'Applications.Core',
              type: 'System.Resources/resourceproviders',
              systemData: {},
              properties: {
                namespace: 'Applications.Core',
                type: 'containers',
                apiVersion: '2021-04-01',
                apiVersions: ['2021-04-01'],
              },
            },
          ],
        }),
    };

    await renderInTestApp(
      <TestApiProvider apis={[[radiusApiRef, api]]}>
        <ResourceTypesTable title="Resource Types" />
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/resource-types/:namespace/:typeName':
            resourceTypeDetailPageRouteRef,
        },
      },
    );

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    const table = screen.getByRole('table');
    const rows = table.querySelectorAll('tbody > tr');

    // Should only show 1 row (Custom.Database), Applications.Core should be filtered
    expect(rows).toHaveLength(1);
    const row1 = rows[0];

    const row1Cells = row1.querySelectorAll('td');
    expect(row1Cells[0]).toHaveTextContent('mongoDatabases');
    expect(row1Cells[1]).toHaveTextContent('Custom.Database');

    // Verify that the checkbox exists
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeInTheDocument();
  });
});
