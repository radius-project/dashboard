import React from 'react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { screen, waitFor } from '@testing-library/react';
import { RadiusApi } from '../../api';
import { radiusApiRef } from '../../plugin';
import { ResourceList } from '../../resources';
import { ResourceTable } from './ResourceTable';
import { resourcePageRouteRef, environmentPageRouteRef } from '../../routes';

describe('ResourceTable', () => {
  it('should display loading indicator while loading', async () => {
    // This is the boilerplate for an unresolved promise.
    const deferred: ((resolve: { value: never[] }) => void)[] = [];
    const api: Pick<RadiusApi, 'listResources'> = {
      listResources: async <T = { [key: string]: unknown },>() =>
        new Promise<ResourceList<T>>(resolve => {
          deferred.push(resolve);
        }),
    };

    await renderInTestApp(
      <TestApiProvider apis={[[radiusApiRef, api]]}>
        <ResourceTable title="Testing" />
      </TestApiProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('progress')).toBeInTheDocument();
    });

    // "Complete" the loading of resources.
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
    const api: Pick<RadiusApi, 'listResources'> = {
      listResources: async () => Promise.reject(new Error('Oh noes!')),
    };

    await renderInTestApp(
      <TestApiProvider apis={[[radiusApiRef, api]]}>
        <ResourceTable title="Testing" />
      </TestApiProvider>,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent('Oh noes!');
  });

  it('should render empty table', async () => {
    const api: Pick<RadiusApi, 'listResources'> = {
      listResources: async () =>
        Promise.resolve({
          value: [],
        }),
    };

    await renderInTestApp(
      <TestApiProvider apis={[[radiusApiRef, api]]}>
        <ResourceTable title="Testing" />
      </TestApiProvider>,
    );
    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();
  });

  it('should render table with items', async () => {
    const api: Pick<RadiusApi, 'listResources'> = {
      listResources: async <T = { [key: string]: unknown },>() =>
        Promise.resolve<ResourceList<T>>({
          value: [
            {
              id: '/planes/radius/local/resourceGroups/test-group/providers/Applications.Core/applications/test-app',
              type: 'Applications.Core/applications',
              name: 'test-app',
              systemData: {},
              properties: {
                provisioningState: 'Succeeded',
                environment:
                  '/planes/radius/local/resourceGroups/test-group-env/providers/Applications.Core/environments/test-env',
              } as T,
            },
            {
              id: '/planes/radius/local/resourceGroups/test-group-env/providers/Applications.Core/environments/test-env',
              type: 'Applications.Core/environments',
              name: 'test-env',
              systemData: {},
              properties: {
                provisioningState: 'Succeeded',
              } as T,
            },
            {
              id: '/planes/radius/local/resourceGroups/test-group/providers/Applications.Core/containers/test-container',
              type: 'Applications.Core/containers',
              name: 'test-container',
              systemData: {},
              properties: {
                provisioningState: 'Succeeded',
                application:
                  '/planes/radius/local/resourceGroups/test-group/providers/Applications.Core/applications/test-app',
                environment:
                  '/planes/radius/local/resourceGroups/test-group-env/providers/Applications.Core/environments/test-env',
              } as T,
            },
            {
              id: '/planes/radius/local/resourceGroups/test-group/providers/Applications.Datastores/redisCaches/test-db',
              type: 'Applications.Datastores/redisCaches',
              name: 'test-db',
              systemData: {},
              properties: {
                provisioningState: 'Succeeded',
                application:
                  '/planes/radius/local/resourceGroups/test-group/providers/Applications.Core/applications/test-app',
                environment:
                  '/planes/radius/local/resourceGroups/test-group-env/providers/Applications.Core/environments/test-env',
              } as T,
            },
          ],
        }),
    };

    await renderInTestApp(
      <TestApiProvider apis={[[radiusApiRef, api]]}>
        <ResourceTable title="Testing" />
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/resources': resourcePageRouteRef,
          '/environments': environmentPageRouteRef,
        },
      },
    );
    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();

    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(5); // Header + 4 resources
    const [header, app, env, container, db] = rows;

    // Verify correct headings
    const expectedColumns = [
      'Name',
      'Resource Group',
      'Type',
      'Application',
      'Environment',
      'Status',
    ];
    const headings = header.querySelectorAll('th');
    expect(headings).toHaveLength(expectedColumns.length);
    headings.forEach((heading, index) => {
      expect(heading).toHaveTextContent(expectedColumns[index]);
    });

    // Verify correct data: application
    const appCells = app.querySelectorAll('td');
    expect(appCells).toHaveLength(expectedColumns.length);
    expect(appCells[0]).toHaveTextContent('test-app');
    expect(appCells[1]).toHaveTextContent('test-group');
    expect(appCells[2]).toHaveTextContent('Applications.Core/applications');
    expect(appCells[3]).toHaveTextContent('');
    expect(appCells[4]).toHaveTextContent('test-env');
    expect(appCells[5]).toHaveTextContent('Succeeded');

    // Verify correct data: environment
    const envCells = env.querySelectorAll('td');
    expect(envCells).toHaveLength(expectedColumns.length);
    expect(envCells[0]).toHaveTextContent('test-env');
    expect(envCells[1]).toHaveTextContent('test-group');
    expect(envCells[2]).toHaveTextContent('Applications.Core/environments');
    expect(envCells[3]).toHaveTextContent('');
    expect(envCells[4]).toHaveTextContent('');
    expect(envCells[5]).toHaveTextContent('Succeeded');

    // Verify correct data: container
    const containerCells = container.querySelectorAll('td');
    expect(containerCells).toHaveLength(expectedColumns.length);
    expect(containerCells[0]).toHaveTextContent('test-container');
    expect(containerCells[1]).toHaveTextContent('test-group');
    expect(containerCells[2]).toHaveTextContent('Applications.Core/containers');
    expect(containerCells[3]).toHaveTextContent('test-app');
    expect(containerCells[4]).toHaveTextContent('test-env');
    expect(containerCells[5]).toHaveTextContent('Succeeded');

    // Verify correct data: db
    const dbCells = db.querySelectorAll('td');
    expect(dbCells).toHaveLength(expectedColumns.length);
    expect(dbCells[0]).toHaveTextContent('test-db');
    expect(dbCells[1]).toHaveTextContent('test-group');
    expect(dbCells[2]).toHaveTextContent('Applications.Datastores/redisCaches');
    expect(dbCells[3]).toHaveTextContent('test-app');
    expect(dbCells[4]).toHaveTextContent('test-env');
    expect(dbCells[5]).toHaveTextContent('Succeeded');
  });
});
