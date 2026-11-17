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

  /**
   * KNOWN-DEFECT, tracked by radius-project/dashboard#352.
   *
   * `parseResourceId` rejects ids it should accept, and the two consumers here
   * disagree about what to do when it does. The Actions column returns `null`,
   * degrading quietly; `ResourceLink` throws. Because they render in the same
   * row, the throw wins.
   *
   * Two things make this worse than a broken row.
   *
   * The blast radius: the failure is not confined to the offending row, or even
   * to the card. One unparseable id takes down every application in the list,
   * and there is no error boundary between this card and the page embedding it
   * — so in the app it is the surrounding page that fails, not just the card.
   *
   * The diagnosis: the thrown `Invalid resource id` never reaches the user.
   * React unwinds the tree, and `MaterialTable.componentDidMount` then
   * dereferences a now-null ref, so the error actually surfaced is
   * `Cannot read properties of null (reading 'scrollWidth')`. The reported
   * cause names a table-measurement internal and says nothing about resource
   * ids, which is why the assertion below checks that the real cause is
   * *absent* from the output. Anyone debugging this from a bug report starts
   * in entirely the wrong place.
   *
   * `neo4jDatabases` is used deliberately — a digit in the resource type is
   * legal per the upstream manifest validation rules, and this is a real Radius
   * type, not a contrived string.
   */
  it('AC-08: KNOWN-DEFECT one unparseable id destroys the card and misreports the cause', async () => {
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
