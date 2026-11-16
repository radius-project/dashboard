import React from 'react';
import { EnvironmentListPage } from './EnvironmentListPage';
import { fireEvent, screen } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { RadiusApi } from '../../api';
import { radiusApiRef } from '../../plugin';
import { EnvironmentProperties, ResourceList } from '../../resources';
import { environmentPageRouteRef, resourcePageRouteRef } from '../../routes';
import { RadiusApiImpl } from '../../api/api';
import { connectionKey } from '../../api/connections';

describe('EnvironmentListPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

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
      {
        mountedRoutes: {
          '/resource/:group/:namespace/:type/:name': resourcePageRouteRef,
          '/environment/:group/:namespace/:type/:name': environmentPageRouteRef,
        },
      },
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

  it('retains the filter contract for host overrides without connection management', async () => {
    localStorage.setItem('radius-environment-filter-resource-group', 'group-b');
    const api: Pick<RadiusApi, 'listResources'> = {
      listResources: async <T = EnvironmentProperties,>() =>
        Promise.resolve<ResourceList<T>>({
          value: [
            {
              id: '/planes/radius/local/resourceGroups/group-a/providers/Applications.Core/environments/env-a',
              name: 'env-a',
              type: 'Applications.Core/environments',
              properties: {},
            },
            {
              id: '/planes/radius/local/resourceGroups/group-b/providers/Applications.Core/environments/env-b',
              name: 'env-b',
              type: 'Applications.Core/environments',
              properties: {},
            },
          ] as ResourceList<T>['value'],
        }),
    };

    await renderInTestApp(
      <TestApiProvider apis={[[radiusApiRef, api]]}>
        <EnvironmentListPage />
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/resource/:group/:namespace/:type/:name': resourcePageRouteRef,
          '/environment/:group/:namespace/:type/:name': environmentPageRouteRef,
        },
      },
    );

    expect(
      await screen.findByRole('button', {
        name: /filter by resource group/i,
      }),
    ).toHaveTextContent('group-b');
    expect(
      localStorage.getItem('radius-environment-filter-resource-group'),
    ).toBe('group-b');
  });

  it('CN-06: isolates saved filters by both cluster and plane and ignores the old global key', async () => {
    const contexts = [
      { connectionId: 'cluster-a', plane: { type: 'radius', name: 'local' } },
      { connectionId: 'cluster-b', plane: { type: 'radius', name: 'local' } },
      { connectionId: 'cluster-b', plane: { type: 'radius', name: 'team' } },
    ];
    const prefix = 'radius-environment-filter-resource-group';
    localStorage.setItem(prefix, 'group-a');
    localStorage.setItem(`${prefix}:${connectionKey(contexts[1])}`, 'group-b');
    localStorage.setItem(`${prefix}:${connectionKey(contexts[2])}`, 'group-a');
    const api = new RadiusApiImpl(
      {
        getClusters: jest
          .fn()
          .mockResolvedValue([{ name: 'cluster-a' }, { name: 'cluster-b' }]),
        proxy: jest.fn(),
      },
      undefined,
      contexts,
    );
    jest.spyOn(api, 'listResources').mockResolvedValue({
      value: ['a', 'b'].map(group => ({
        id: `/planes/radius/local/resourceGroups/group-${group}/providers/Applications.Core/environments/env-${group}`,
        name: `env-${group}`,
        type: 'Applications.Core/environments',
        properties: {},
        systemData: {},
      })),
    });
    await renderInTestApp(
      <TestApiProvider apis={[[radiusApiRef, api]]}>
        <EnvironmentListPage />
      </TestApiProvider>,
      {
        routeEntries: [
          `/?radiusConnection=${encodeURIComponent(connectionKey(contexts[0]))}`,
        ],
        mountedRoutes: {
          '/resource/:group/:namespace/:type/:name': resourcePageRouteRef,
          '/environment/:group/:namespace/:type/:name': environmentPageRouteRef,
        },
      },
    );
    const filter = () =>
      screen.getByRole('button', { name: /filter by resource group/i });
    expect(
      await screen.findByRole('button', { name: /filter by resource group/i }),
    ).toHaveTextContent('All Resource Groups');
    for (const [label, expected] of [
      ['cluster-b / radius/local', 'group-b'],
      ['cluster-b / radius/team', 'group-a'],
      ['cluster-a / radius/local', 'All Resource Groups'],
    ]) {
      fireEvent.mouseDown(
        screen.getByRole('button', { name: 'Radius connection' }),
      );
      fireEvent.click(await screen.findByRole('option', { name: label }));
      expect(
        await screen.findByRole('button', {
          name: /filter by resource group/i,
        }),
      ).toHaveTextContent(expected);
    }
    fireEvent.mouseDown(filter());
    fireEvent.click(await screen.findByRole('option', { name: 'group-b' }));
    expect(
      localStorage.getItem(`${prefix}:${connectionKey(contexts[0])}`),
    ).toBe('group-b');
    expect(
      localStorage.getItem(`${prefix}:${connectionKey(contexts[2])}`),
    ).toBe('group-a');
  });
});
