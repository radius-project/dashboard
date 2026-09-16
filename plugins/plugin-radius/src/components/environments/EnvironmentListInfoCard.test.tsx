import React from 'react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { screen, waitFor } from '@testing-library/react';
import { RadiusApi } from '../../api';
import { radiusApiRef } from '../../plugin';
import { resourcePageRouteRef, environmentPageRouteRef } from '../../routes';
import { EnvironmentListInfoCard } from './EnvironmentListInfoCard';
import { EnvironmentProperties, Resource } from '../../resources';

const makeEnvironment = (
  name: string,
  id?: string,
): Resource<EnvironmentProperties> =>
  ({
    id:
      id ??
      `/planes/radius/local/resourceGroups/default/providers/Applications.Core/environments/${name}`,
    name,
    type: 'Applications.Core/environments',
    properties: {},
  }) as Resource<EnvironmentProperties>;

/**
 * `listEnvironments` is generic over the properties type, so an object literal
 * cannot satisfy a Pick of that method. Pin the type argument here instead of
 * widening the stub with `any`.
 */
type EnvApiStub = {
  listEnvironments: (opts?: {
    resourceGroup?: string;
  }) => Promise<{ value: Resource<EnvironmentProperties>[] }>;
};

const renderCard = async (api: EnvApiStub): Promise<void> => {
  await renderInTestApp(
    <TestApiProvider apis={[[radiusApiRef, api as unknown as RadiusApi]]}>
      <EnvironmentListInfoCard />
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
 * The environment half of the pair of cards the plugin exports for embedding
 * without a route. It had no test at all.
 */
describe('EnvironmentListInfoCard', () => {
  it('EC-01: shows progress while the environments load', async () => {
    const api: EnvApiStub = {
      listEnvironments: () => new Promise(() => {}),
    };

    await renderCard(api);

    expect(screen.getByTestId('progress')).toBeInTheDocument();
  });

  it('EC-02: renders the card title even before data arrives', async () => {
    const api: EnvApiStub = {
      listEnvironments: () => new Promise(() => {}),
    };

    await renderCard(api);

    expect(screen.getByText('Environments')).toBeInTheDocument();
  });

  it('EC-03: surfaces a failed fetch as an error panel', async () => {
    const api: EnvApiStub = {
      listEnvironments: async () => Promise.reject(new Error('Proxy is down')),
    };

    await renderCard(api);

    await waitFor(() => {
      expect(screen.getAllByText(/Proxy is down/).length).toBeGreaterThan(0);
    });
  });

  it('EC-04: renders an empty list without failing', async () => {
    const api: EnvApiStub = {
      listEnvironments: async () => ({ value: [] }),
    };

    await renderCard(api);

    await waitFor(() => {
      expect(screen.getByText('Environments')).toBeInTheDocument();
    });
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  /**
   * The name column routes through `ResourceLink`, which sends environment
   * types to the environment route rather than the resource route. That
   * branch is the reason this card is not interchangeable with the
   * application one.
   */
  it('EC-05: links each environment to the environment page, not the resource page', async () => {
    const api: EnvApiStub = {
      listEnvironments: async () => ({ value: [makeEnvironment('default')] }),
    };

    await renderCard(api);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'default' })).toHaveAttribute(
        'href',
        '/environment/default/Applications.Core/environments/default',
      );
    });
  });

  it('EC-06: offers the overview and resources actions for each environment', async () => {
    const api: EnvApiStub = {
      listEnvironments: async () => ({ value: [makeEnvironment('default')] }),
    };

    await renderCard(api);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Overview' })).toHaveAttribute(
        'href',
        '/environment/default/Applications.Core/environments/default/overview',
      );
    });
    expect(screen.getByRole('button', { name: 'Resources' })).toHaveAttribute(
      'href',
      '/environment/default/Applications.Core/environments/default/resources',
    );
  });

  it('EC-07: renders every environment returned, not just the first', async () => {
    const api: EnvApiStub = {
      listEnvironments: async () => ({
        value: [makeEnvironment('prod'), makeEnvironment('staging')],
      }),
    };

    await renderCard(api);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'prod' })).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'staging' })).toBeInTheDocument();
  });

  /**
   * KNOWN-DEFECT, tracked by radius-project/dashboard#352. See the equivalent
   * case in `ApplicationListInfoCard.test.tsx` for the reasoning; it is
   * repeated here because the two cards parse ids independently and could
   * diverge during the extraction.
   */
  it('EC-08: KNOWN-DEFECT one unparseable id destroys the card and misreports the cause', async () => {
    const api: EnvApiStub = {
      listEnvironments: async () => ({
        value: [
          makeEnvironment('healthy'),
          makeEnvironment(
            'with_underscore',
            '/planes/radius/local/resourceGroups/default/providers/Applications.Core/environments/with_underscore',
          ),
        ],
      }),
    };

    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    try {
      await renderCard(api);

      await waitFor(() => {
        expect(screen.getByText(/Something Went Wrong/i)).toBeInTheDocument();
      });

      expect(screen.queryByText('healthy')).toBeNull();
      expect(document.body.textContent).not.toMatch(/Invalid resource id/);
    } finally {
      consoleError.mockRestore();
    }
  });
});
