import React from 'react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { screen, waitFor } from '@testing-library/react';
import { RadiusApi } from '../../api';
import { radiusApiRef } from '../../plugin';
import { resourcePageRouteRef, environmentPageRouteRef } from '../../routes';
import { ApplicationListInfoCard } from './ApplicationListInfoCard';
import { ApplicationProperties, Resource } from '../../resources';

const makeApplication = (
  name: string,
  id?: string,
): Resource<ApplicationProperties> =>
  ({
    id:
      id ??
      `/planes/radius/local/resourceGroups/default/providers/Applications.Core/applications/${name}`,
    name,
    type: 'Applications.Core/applications',
    properties: { environment: '/environment/default' },
  }) as Resource<ApplicationProperties>;

/**
 * `listApplications` is generic over the properties type, so an object literal
 * cannot satisfy a Pick of that method. Pin the type argument
 * here instead of widening the stub with `any`.
 */
type AppApiStub = {
  listApplications: (opts?: {
    resourceGroup?: string;
  }) => Promise<{ value: Resource<ApplicationProperties>[] }>;
};

const renderCard = async (api: AppApiStub): Promise<void> => {
  await renderInTestApp(
    <TestApiProvider apis={[[radiusApiRef, api as unknown as RadiusApi]]}>
      <ApplicationListInfoCard />
    </TestApiProvider>,
    {
      mountedRoutes: {
        '/resource/:group/:namespace/:type/:name': resourcePageRouteRef,
        '/environment/:group/:namespace/:type/:name': environmentPageRouteRef,
      },
    },
  );
};

/**
 * This card is one of the two components the plugin exports for a host to embed
 * without mounting a route, so it is part of the published surface rather than
 * an internal detail. It had no test at all.
 */
describe('ApplicationListInfoCard', () => {
  it('AC-01: shows progress while the applications load', async () => {
    const api: AppApiStub = {
      listApplications: () => new Promise(() => {}),
    };

    await renderCard(api);

    expect(screen.getByTestId('progress')).toBeInTheDocument();
  });

  it('AC-02: renders the card title even before data arrives', async () => {
    const api: AppApiStub = {
      listApplications: () => new Promise(() => {}),
    };

    await renderCard(api);

    expect(screen.getByText('Applications')).toBeInTheDocument();
  });

  it('AC-03: surfaces a failed fetch as an error panel', async () => {
    const api: AppApiStub = {
      listApplications: async () => Promise.reject(new Error('Proxy is down')),
    };

    await renderCard(api);

    await waitFor(() => {
      expect(screen.getAllByText(/Proxy is down/).length).toBeGreaterThan(0);
    });
  });

  it('AC-04: renders an empty list without failing', async () => {
    const api: AppApiStub = {
      listApplications: async () => ({ value: [] }),
    };

    await renderCard(api);

    await waitFor(() => {
      expect(screen.getByText('Applications')).toBeInTheDocument();
    });
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('AC-05: links each application to its resource page', async () => {
    const api: AppApiStub = {
      listApplications: async () => ({ value: [makeApplication('my-app')] }),
    };

    await renderCard(api);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'my-app' })).toHaveAttribute(
        'href',
        '/resource/default/Applications.Core/applications/my-app',
      );
    });
  });

  it('AC-06: offers the graph and resources actions for each application', async () => {
    const api: AppApiStub = {
      listApplications: async () => ({ value: [makeApplication('my-app')] }),
    };

    await renderCard(api);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'App Graph' })).toHaveAttribute(
        'href',
        '/resource/default/Applications.Core/applications/my-app/application',
      );
    });
    expect(screen.getByRole('button', { name: 'Resources' })).toHaveAttribute(
      'href',
      '/resource/default/Applications.Core/applications/my-app/resources',
    );
  });

  it('AC-07: renders every application returned, not just the first', async () => {
    const api: AppApiStub = {
      listApplications: async () => ({
        value: [makeApplication('alpha'), makeApplication('beta')],
      }),
    };

    await renderCard(api);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'alpha' })).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'beta' })).toBeInTheDocument();
  });

  it('AC-08 / #352: legal digits in resource types retain both healthy rows and navigation', async () => {
    const api: AppApiStub = {
      listApplications: async () => ({
        value: [
          makeApplication('healthy'),
          makeApplication(
            'neo4j',
            '/planes/radius/local/resourceGroups/default/providers/Radius.Data/neo4jDatabases/neo4j',
          ),
        ],
      }),
    };

    await renderCard(api);
    expect(await screen.findByRole('link', { name: 'healthy' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'neo4j' })).toHaveAttribute(
      'href',
      '/resource/default/Radius.Data/neo4jDatabases/neo4j',
    );
    expect(screen.queryByText(/Something Went Wrong/i)).toBeNull();
  });
});
