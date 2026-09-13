import React from 'react';
import { EnvironmentListPage } from './EnvironmentListPage';
import { screen } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { RadiusApi } from '../../api';
import { radiusApiRef } from '../../plugin';
import { EnvironmentProperties, ResourceList } from '../../resources';
import { environmentPageRouteRef, resourcePageRouteRef } from '../../routes';

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

  /**
   * KNOWN-DEFECT: the persisted filter key has no connection identity, so two
   * clusters with the same resource-group name share state. Tracked by #368.
   */
  it('CN-06: KNOWN-DEFECT restores the resource-group filter from one global storage key', async () => {
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
});
