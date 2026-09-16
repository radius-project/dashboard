import React from 'react';
import { screen } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { ResourceListPage } from './ResourceListPage';
import { RadiusApi } from '../../api';
import { radiusApiRef } from '../../plugin';
import { resourcePageRouteRef, environmentPageRouteRef } from '../../routes';
import { Resource, ResourceList } from '../../resources';

/**
 * RL-xx: characterization tests for the resource list page.
 *
 * The page itself is a thin shell over `ResourceTable`, but it is the only
 * place the table is rendered without a resource type, which selects the
 * Type/Application/Environment/Status column set rather than the environment
 * one. That column set had no test.
 */

const resource: Resource = {
  id: '/planes/radius/local/resourceGroups/default/providers/Applications.Core/containers/frontend',
  name: 'frontend',
  type: 'Applications.Core/containers',
  systemData: {},
  properties: {
    application:
      '/planes/radius/local/resourceGroups/default/providers/Applications.Core/applications/demo',
    environment:
      '/planes/radius/local/resourceGroups/default/providers/Applications.Core/environments/default',
    provisioningState: 'Succeeded',
  },
};

const renderPage = async (api: Partial<RadiusApi>) =>
  renderInTestApp(
    <TestApiProvider apis={[[radiusApiRef, api]]}>
      <ResourceListPage />
    </TestApiProvider>,
    {
      mountedRoutes: {
        '/resource/:group/:namespace/:type/:name': resourcePageRouteRef,
        '/environment/:group/:namespace/:type/:name': environmentPageRouteRef,
      },
    },
  );

describe('ResourceListPage', () => {
  it('RL-01: renders the page header', async () => {
    const api: Pick<RadiusApi, 'listResources'> = {
      listResources: async <T,>() =>
        Promise.resolve({ value: [] } as unknown as ResourceList<T>),
    };

    await renderPage(api);

    expect(
      screen.getByText('Displaying deployed resources.'),
    ).toBeInTheDocument();
  });

  it('RL-02: renders the untyped column set', async () => {
    const api: Pick<RadiusApi, 'listResources'> = {
      listResources: async <T,>() =>
        Promise.resolve({ value: [] } as unknown as ResourceList<T>),
    };

    await renderPage(api);

    const [header] = screen.getAllByRole('row');
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
  });

  it('RL-03: renders a row for each resource', async () => {
    const api: Pick<RadiusApi, 'listResources'> = {
      listResources: async <T,>() =>
        Promise.resolve({ value: [resource] } as unknown as ResourceList<T>),
    };

    await renderPage(api);

    expect(await screen.findByText('frontend')).toBeInTheDocument();
    expect(
      screen.getByText('Applications.Core/containers'),
    ).toBeInTheDocument();
    expect(screen.getByText('Succeeded')).toBeInTheDocument();
    // Resource group is derived from the id rather than carried on the payload.
    expect(screen.getAllByText('default').length).toBeGreaterThan(0);
  });

  it('RL-04: renders the error panel when the list request fails', async () => {
    const api: Pick<RadiusApi, 'listResources'> = {
      listResources: async () => {
        throw new Error('list failed');
      },
    };

    await renderPage(api);

    expect((await screen.findAllByText(/list failed/)).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
