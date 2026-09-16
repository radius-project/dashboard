import React from 'react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { screen, waitFor } from '@testing-library/react';
import { radiusApiRef } from '../../plugin';
import { resourcePageRouteRef, environmentPageRouteRef } from '../../routes';
import { EnvironmentResourcesTab } from './EnvironmentResourcesTab';
import { RadiusApi } from '../../api';
import { EnvironmentProperties, Resource } from '../../resources';

/**
 * Reads the Name column only. The environment's own name also appears in the
 * Environment column of every row it owns, so a whole-table query cannot tell
 * "the environment is listed as one of its own resources" from "the rows
 * correctly say which environment they belong to".
 */
const listedResourceNames = (): string[] =>
  Array.from(document.querySelectorAll('tbody tr'))
    .map(row => row.querySelector('td')?.textContent?.trim() ?? '')
    .filter(Boolean);

const environmentId =
  '/planes/radius/local/resourceGroups/default/providers/Applications.Core/environments/prod';

const environment = {
  id: environmentId,
  name: 'prod',
  type: 'Applications.Core/environments',
  properties: {},
} as unknown as Resource<EnvironmentProperties>;

const makeResource = (name: string, environment_?: string) => ({
  id: `/planes/radius/local/resourceGroups/default/providers/Applications.Core/containers/${name}`,
  name,
  type: 'Applications.Core/containers',
  properties: environment_ ? { environment: environment_ } : {},
});

/**
 * `listResources` is generic over the properties type, so an object literal
 * cannot satisfy a Pick of that method. Pin the type argument here instead of
 * widening the stub with `any`.
 */
type ResourcesApiStub = {
  listResources: (opts?: {
    resourceType?: string;
    resourceGroup?: string;
  }) => Promise<{ value: Resource[] }>;
};

const renderTab = async (resources: unknown[]) => {
  const api: ResourcesApiStub = {
    listResources: async () => ({ value: resources as Resource[] }),
  };

  await renderInTestApp(
    <TestApiProvider apis={[[radiusApiRef, api as unknown as RadiusApi]]}>
      <EnvironmentResourcesTab environment={environment} />
    </TestApiProvider>,
    {
      mountedRoutes: {
        '/resource/:group/:namespace/:type/:name': resourcePageRouteRef,
        '/environment/:group/:namespace/:type/:name': environmentPageRouteRef,
      },
    },
  );
};

describe('EnvironmentResourcesTab', () => {
  it('EV-01: titles the table for environment resources', async () => {
    await renderTab([]);

    await waitFor(() => {
      expect(screen.getByText('Environment Resources')).toBeInTheDocument();
    });
  });

  it('EV-02: shows only resources belonging to this environment', async () => {
    await renderTab([
      makeResource('frontend', environmentId),
      makeResource('unrelated', `${environmentId}-other`),
    ]);

    await waitFor(() => {
      expect(screen.getByText('frontend')).toBeInTheDocument();
    });

    expect(listedResourceNames()).toEqual(['frontend']);
  });

  it('EV-03: does not list the environment itself among its resources', async () => {
    await renderTab([
      makeResource('frontend', environmentId),
      // Membership alone includes this row; only the self-ID guard excludes it.
      { ...environment, properties: { environment: environmentId } },
    ]);

    await waitFor(() => {
      expect(screen.getByText('frontend')).toBeInTheDocument();
    });

    expect(listedResourceNames()).toEqual(['frontend']);
    expect(listedResourceNames()).not.toContain(environment.name);
  });
});
