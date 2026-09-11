import React from 'react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { screen, waitFor } from '@testing-library/react';
import {
  applicationListPageRouteRef,
  environmentListPageRouteRef,
  resourcePageRouteRef,
  environmentPageRouteRef,
} from '@internal/plugin-radius';
// `radiusApiRef` and `RadiusApi` are not part of the plugin's public export
// list, which is radius-project/dashboard#358 and is pinned by PU-19. A host
// cannot supply the API the plugin requires without reaching inside the
// package, and this test has to do the same thing a host would. The rule is
// disabled rather than worked around precisely because the reach-in is the
// defect: when #358 is fixed these two lines become barrel imports and the
// disable comment goes with them.
/* eslint-disable @backstage/no-forbidden-package-imports */
import { radiusApiRef } from '@internal/plugin-radius/src/plugin';
import { RadiusApi } from '@internal/plugin-radius/src/api';
/* eslint-enable @backstage/no-forbidden-package-imports */
import { HomePage } from './HomePage';

/**
 * `HomePage` is the host's composition of five components: the three static
 * cards and the two plugin cards a host can embed without a route. Those five
 * have their own suites, so this one asserts the composition itself -- that
 * every card is present, that the two data-backed cards are actually wired to
 * the Radius API, and that a failing cluster surfaces on the landing page
 * rather than rendering a blank panel.
 */
type HomeApiStub = {
  listApplications: () => Promise<{ value: unknown[] }>;
  listEnvironments: () => Promise<{ value: unknown[] }>;
};

const renderHome = async (api: HomeApiStub): Promise<void> => {
  await renderInTestApp(
    <TestApiProvider apis={[[radiusApiRef, api as unknown as RadiusApi]]}>
      <HomePage />
    </TestApiProvider>,
    {
      mountedRoutes: {
        '/applications': applicationListPageRouteRef,
        '/environments': environmentListPageRouteRef,
        '/resource/:group/:namespace/:type/:name': resourcePageRouteRef,
        '/environment/:group/:namespace/:type/:name': environmentPageRouteRef,
      },
    },
  );
};

const empty: HomeApiStub = {
  listApplications: async () => ({ value: [] }),
  listEnvironments: async () => ({ value: [] }),
};

describe('HomePage', () => {
  it('HP-01: renders the three static cards with their headings', async () => {
    await renderHome(empty);

    await waitFor(() => {
      expect(screen.getByText('Learn more')).toBeInTheDocument();
    });
    expect(screen.getByText('Join the community')).toBeInTheDocument();
    expect(screen.getByText('Get help with Radius')).toBeInTheDocument();
  });

  it('HP-02: renders the Radius logo as the page banner', async () => {
    const { container } = await renderInTestApp(
      <TestApiProvider apis={[[radiusApiRef, empty as unknown as RadiusApi]]}>
        <HomePage />
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/applications': applicationListPageRouteRef,
          '/environments': environmentListPageRouteRef,
          '/resource/:group/:namespace/:type/:name': resourcePageRouteRef,
          '/environment/:group/:namespace/:type/:name': environmentPageRouteRef,
        },
      },
    );

    await waitFor(() => {
      expect(screen.getByText('Learn more')).toBeInTheDocument();
    });
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('HP-03: embeds both plugin cards alongside the static ones', async () => {
    await renderHome(empty);

    await waitFor(() => {
      expect(screen.getByText('Applications')).toBeInTheDocument();
    });
    expect(screen.getByText('Environments')).toBeInTheDocument();
  });

  it('HP-04: shows progress in both plugin cards while the cluster is queried', async () => {
    await renderHome({
      listApplications: () => new Promise(() => {}),
      listEnvironments: () => new Promise(() => {}),
    });

    expect(screen.getAllByTestId('progress')).toHaveLength(2);
  });

  it('HP-05: lists the applications and environments the cluster returns', async () => {
    await renderHome({
      listApplications: async () => ({
        value: [
          {
            id: '/planes/radius/local/resourceGroups/default/providers/Applications.Core/applications/demo-app',
            name: 'demo-app',
            type: 'Applications.Core/applications',
            properties: { environment: '/environment/default' },
          },
        ],
      }),
      listEnvironments: async () => ({
        value: [
          {
            id: '/planes/radius/local/resourceGroups/default/providers/Applications.Core/environments/demo-env',
            name: 'demo-env',
            type: 'Applications.Core/environments',
            properties: {},
          },
        ],
      }),
    });

    await waitFor(() => {
      expect(
        screen.getByRole('link', { name: 'demo-app' }),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'demo-env' })).toBeInTheDocument();
  });

  it('HP-06: surfaces an unreachable cluster on the landing page instead of a blank card', async () => {
    await renderHome({
      listApplications: async () => Promise.reject(new Error('Proxy is down')),
      listEnvironments: async () => Promise.reject(new Error('Proxy is down')),
    });

    await waitFor(() => {
      expect(screen.getAllByText(/Proxy is down/).length).toBeGreaterThan(0);
    });
    // The static cards must keep rendering; a dead cluster is not a dead page.
    expect(screen.getByText('Learn more')).toBeInTheDocument();
  });

  it('HP-07: keeps rendering the environments card when only applications fail', async () => {
    await renderHome({
      listApplications: async () =>
        Promise.reject(new Error('Applications unavailable')),
      listEnvironments: async () => ({ value: [] }),
    });

    await waitFor(() => {
      expect(
        screen.getAllByText(/Applications unavailable/).length,
      ).toBeGreaterThan(0);
    });
    expect(screen.getByText('Environments')).toBeInTheDocument();
  });
});
