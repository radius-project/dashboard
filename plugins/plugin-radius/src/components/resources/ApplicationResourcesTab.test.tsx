import React from 'react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { screen, waitFor } from '@testing-library/react';
import { radiusApiRef } from '../../plugin';
import { resourcePageRouteRef, environmentPageRouteRef } from '../../routes';
import { ApplicationResourcesTab } from './ApplicationResourcesTab';
import { RadiusApi } from '../../api';
import { Resource } from '../../resources';

/**
 * Reads the Name column only. The application's own name also appears in the
 * breadcrumbs above the table and in the Application column of every row it
 * owns, so a whole-table or whole-page query cannot tell "the application is
 * listed as one of its own resources" from "the rows correctly say which
 * application they belong to".
 */
const listedResourceNames = (): string[] =>
  Array.from(document.querySelectorAll('tbody tr'))
    .map(row => row.querySelector('td')?.textContent?.trim() ?? '')
    .filter(Boolean);

const applicationId =
  '/planes/radius/local/resourceGroups/default/providers/Applications.Core/applications/store';

const application = {
  id: applicationId,
  name: 'store',
  type: 'Applications.Core/applications',
  properties: {},
} as unknown as Resource;

const makeResource = (name: string, application_?: string) => ({
  id: `/planes/radius/local/resourceGroups/default/providers/Applications.Core/containers/${name}`,
  name,
  type: 'Applications.Core/containers',
  properties: application_ ? { application: application_ } : {},
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
      <ApplicationResourcesTab resource={application} />
    </TestApiProvider>,
    {
      mountedRoutes: {
        '/resource/:group/:namespace/:type/:name': resourcePageRouteRef,
        '/environment/:group/:namespace/:type/:name': environmentPageRouteRef,
      },
    },
  );
};

describe('ApplicationResourcesTab', () => {
  it('AR-01: titles the table for application resources', async () => {
    await renderTab([]);

    await waitFor(() => {
      expect(screen.getByText('Application Resources')).toBeInTheDocument();
    });
  });

  /**
   * The tab's only real job is to pass its own resource id down as the
   * application filter. Asserting on the filtered output rather than on the
   * prop keeps the test pointed at the behavior, so it survives the table
   * being reimplemented during the extraction.
   */
  it('AR-02: shows only resources belonging to this application', async () => {
    await renderTab([
      makeResource('frontend', applicationId),
      makeResource('unrelated', `${applicationId}-other`),
    ]);

    await waitFor(() => {
      expect(screen.getByText('frontend')).toBeInTheDocument();
    });

    expect(listedResourceNames()).toEqual(['frontend']);
  });

  it('AR-03: does not list the application itself among its resources', async () => {
    await renderTab([
      makeResource('frontend', applicationId),
      { ...application },
    ]);

    await waitFor(() => {
      expect(screen.getByText('frontend')).toBeInTheDocument();
    });

    expect(listedResourceNames()).toEqual(['frontend']);
  });
});
