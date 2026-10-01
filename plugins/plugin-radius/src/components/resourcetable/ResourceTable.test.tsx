import React from 'react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
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
    expect(rows).toHaveLength(6); // Header + column filters + 4 resources
    const [header, filters, app, env, container, db] = rows;

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

    // Every column has a labelled filter input
    expect(
      Array.from(filters.querySelectorAll('input')).map(input =>
        input.getAttribute('aria-label'),
      ),
    ).toEqual(expectedColumns.map(column => `filter data by ${column}`));

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

  /**
   * Sorting and filtering act on the text each cell shows. Several columns show
   * a value derived from the resource ID (the name, resource group, application
   * and environment names) or computed from properties (the environment kind),
   * so the fixtures below are chosen so that ordering or matching on the raw ID
   * would give a different answer than ordering or matching on what is shown.
   */
  describe('sorting and filtering', () => {
    const id = (group: string, type: string, name: string) =>
      `/planes/radius/local/resourceGroups/${group}/providers/${type}/${name}`;
    const app = (group: string, name: string) =>
      id(group, 'Applications.Core/applications', name);
    const env = (group: string, name: string) =>
      id(group, 'Applications.Core/environments', name);

    const resources = [
      {
        id: id('zeta-group', 'Applications.Core/containers', 'frontend'),
        type: 'Applications.Core/containers',
        name: 'frontend',
        properties: {
          provisioningState: 'Succeeded',
          application: app('zeta-group', 'alpha-app'),
          environment: env('alpha-group', 'prod'),
        },
      },
      {
        id: id('alpha-group', 'Applications.Core/containers', 'backend'),
        type: 'Applications.Core/containers',
        name: 'backend',
        properties: {
          provisioningState: 'Failed',
          application: app('alpha-group', 'zulu-app'),
          environment: env('zeta-group', 'dev'),
        },
      },
      {
        id: id('middle-group', 'Applications.Datastores/redisCaches', 'cache'),
        type: 'Applications.Datastores/redisCaches',
        name: 'cache',
        properties: { provisioningState: 'Succeeded' },
      },
    ];

    const renderTable = async (
      value: { id: string; type: string; name: string; properties: object }[],
      resourceType?: string,
    ) => {
      const api: Pick<RadiusApi, 'listResources'> = {
        listResources: async <T = { [key: string]: unknown },>() =>
          Promise.resolve({ value } as unknown as ResourceList<T>),
      };
      await renderInTestApp(
        <TestApiProvider apis={[[radiusApiRef, api]]}>
          <ResourceTable title="Testing" resourceType={resourceType} />
        </TestApiProvider>,
        {
          mountedRoutes: {
            '/resources': resourcePageRouteRef,
            '/environments': environmentPageRouteRef,
          },
        },
      );
    };

    /** The text of one column, for the data rows currently shown, in order. */
    const column = (index: number) =>
      screen
        .getAllByRole('row')
        .filter(row => row.hasAttribute('index'))
        .map(row => row.querySelectorAll('td')[index]?.textContent);

    const sortBy = (title: string) => fireEvent.click(screen.getByText(title));

    const filterBy = (title: string, value: string) =>
      fireEvent.change(screen.getByLabelText(`filter data by ${title}`), {
        target: { value },
      });

    it('should sort by the displayed name, ascending then descending', async () => {
      await renderTable(resources);
      expect(column(0)).toEqual(['frontend', 'backend', 'cache']);

      sortBy('Name');
      expect(column(0)).toEqual(['backend', 'cache', 'frontend']);

      sortBy('Name');
      expect(column(0)).toEqual(['frontend', 'cache', 'backend']);
    });

    it('should sort by the resource group parsed from the ID', async () => {
      await renderTable(resources);

      sortBy('Resource Group');

      expect(column(1)).toEqual(['alpha-group', 'middle-group', 'zeta-group']);
    });

    it('should sort application and environment by name, not by resource ID', async () => {
      await renderTable(resources);

      // By ID, zulu-app (in alpha-group) would sort before alpha-app (in zeta-group).
      sortBy('Application');
      expect(column(3)).toEqual(['', 'alpha-app', 'zulu-app']);

      // By ID, prod (in alpha-group) would sort before dev (in zeta-group).
      sortBy('Environment');
      expect(column(4)).toEqual(['', 'dev', 'prod']);
    });

    it('should filter the name column by the displayed name, ignoring case', async () => {
      await renderTable(resources);

      filterBy('Name', 'END');

      await waitFor(() => expect(column(0)).toEqual(['frontend', 'backend']));
    });

    it('should filter by resource group', async () => {
      await renderTable(resources);

      filterBy('Resource Group', 'zeta');

      await waitFor(() => expect(column(0)).toEqual(['frontend']));
    });

    it('should filter application and environment by the displayed name only', async () => {
      await renderTable(resources);

      // backend's application ID contains "alpha-group", but its name is zulu-app.
      filterBy('Application', 'alpha');
      await waitFor(() => expect(column(0)).toEqual(['frontend']));

      // Every application ID contains "planes"; no application name does.
      filterBy('Application', 'planes');
      await waitFor(() => expect(column(0)).toEqual([]));

      filterBy('Application', '');
      filterBy('Environment', 'dev');
      await waitFor(() => expect(column(0)).toEqual(['backend']));
    });

    it('should filter plain field columns such as type and status', async () => {
      await renderTable(resources);

      filterBy('Type', 'redis');
      await waitFor(() => expect(column(0)).toEqual(['cache']));

      filterBy('Type', '');
      filterBy('Status', 'fail');
      await waitFor(() => expect(column(0)).toEqual(['backend']));
    });

    it('should sort and filter the environment column of an application table by name', async () => {
      await renderTable(
        [
          {
            id: app('alpha-group', 'one'),
            type: 'Applications.Core/applications',
            name: 'one',
            properties: { environment: env('alpha-group', 'prod') },
          },
          {
            id: app('zeta-group', 'two'),
            type: 'Applications.Core/applications',
            name: 'two',
            properties: { environment: env('zeta-group', 'dev') },
          },
        ],
        'Applications.Core/applications',
      );

      sortBy('Environment');
      expect(column(0)).toEqual(['two', 'one']);

      filterBy('Environment', 'prod');
      await waitFor(() => expect(column(0)).toEqual(['one']));
    });

    it('should sort and filter environments by their computed kind', async () => {
      await renderTable(
        [
          {
            id: env('a-group', 'k8s'),
            type: 'Applications.Core/environments',
            name: 'k8s',
            properties: {},
          },
          {
            id: env('b-group', 'on-azure'),
            type: 'Applications.Core/environments',
            name: 'on-azure',
            properties: { providers: { azure: {} } },
          },
          {
            id: env('c-group', 'on-aws'),
            type: 'Applications.Core/environments',
            name: 'on-aws',
            properties: { providers: { aws: {} } },
          },
        ],
        'Applications.Core/environments',
      );
      expect(column(2)).toEqual(['Kubernetes', 'Azure', 'AWS']);

      sortBy('Kind');
      expect(column(2)).toEqual(['AWS', 'Azure', 'Kubernetes']);

      filterBy('Kind', 'azure');
      await waitFor(() => expect(column(0)).toEqual(['on-azure']));
    });
  });
});
