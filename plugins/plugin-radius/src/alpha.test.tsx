import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import {
  AppRootElementBlueprint,
  appTreeApiRef,
  featureFlagsApiRef,
  useApi,
  type AppTree,
  type FeatureFlag,
  FeatureFlagState,
} from '@backstage/frontend-plugin-api';
import { mockApis, renderTestApp } from '@backstage/frontend-test-utils';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes';
import radius from './alpha';
import { radiusApiRef } from './api/ref';
import { RadiusApiImpl } from './api/api';
import type { RadiusApi } from './api/api';

const resourceId =
  '/planes/radius/local/resourceGroups/demo/providers/Applications.Core/applications/demo';
const environmentId =
  '/planes/radius/local/resourceGroups/demo/providers/Applications.Core/environments/demo';

const transport = () => ({
  getClusters: jest
    .fn()
    .mockResolvedValue([
      { name: 'native-cluster', authProvider: 'serviceAccount' },
    ]),
  proxy: jest.fn().mockImplementation(async ({ path }: { path: string }) => {
    if (path.includes('/resourceTypes/applications?')) {
      return new Response(
        JSON.stringify({
          Name: 'applications',
          Description: 'Application resource type',
          ResourceProviderNamespace: 'Radius.Core',
          APIVersions: { '2025-01-01': {} },
          APIVersionList: ['2025-01-01'],
        }),
      );
    }
    if (path.includes(`${resourceId}?`)) {
      return new Response(
        JSON.stringify({
          id: resourceId,
          name: 'demo',
          type: 'Applications.Core/applications',
          properties: { environment: environmentId },
        }),
      );
    }
    if (path.includes(`${environmentId}?`)) {
      return new Response(
        JSON.stringify({
          id: environmentId,
          name: 'demo',
          type: 'Applications.Core/environments',
          properties: {},
        }),
      );
    }
    return new Response(JSON.stringify({ value: [] }));
  }),
});

describe('native Radius registration', () => {
  it.each([
    ['/applications', 'Applications'],
    ['/environments', 'Environments'],
    ['/recipes', 'Recipes'],
    ['/resource-types', 'Resource Types'],
    ['/resources', 'Resources'],
    ['/resource-types/Radius.Core/applications', 'applications'],
    [
      '/resources/demo/Applications.Core/applications/demo/overview',
      'Resource',
    ],
    [
      '/environments/demo/Applications.Core/environments/demo/overview',
      'Environment',
    ],
  ])('FS-01/03: installs the real page at %s', async (route, heading) => {
    const kubernetes = transport();
    renderTestApp({
      features: [radius],
      initialRouteEntries: [route],
      apis: [[kubernetesApiRef, kubernetes]],
    });
    expect(
      await screen.findByRole('heading', { name: heading, level: 1 }),
    ).toBeInTheDocument();
    await waitFor(() => expect(kubernetes.proxy).toHaveBeenCalled());
    expect(
      kubernetes.proxy.mock.calls.every(
        ([request]) => request.clusterName === 'native-cluster',
      ),
    ).toBe(true);
  });

  it('FS-02/04: resolves the real API and registers the flag once through the installed plugin', async () => {
    const observed = jest.fn<void, [RadiusApi, FeatureFlag[], AppTree]>();
    const Probe = () => {
      const api = useApi(radiusApiRef);
      const flags = useApi(featureFlagsApiRef);
      const tree = useApi(appTreeApiRef);
      React.useEffect(() => {
        observed(api, flags.getRegisteredFlags(), tree.getTree().tree);
        void api.getResourceType({
          namespace: 'Radius.Core',
          typeName: 'applications',
          clusterName: 'host-selected-cluster',
        });
      }, [api, flags, tree]);
      return null;
    };
    const kubernetes = transport();
    renderTestApp({
      features: [radius],
      extensions: [
        AppRootElementBlueprint.make({
          name: 'probe',
          params: { element: <Probe /> },
        }),
      ],
      apis: [[kubernetesApiRef, kubernetes]],
    });
    await waitFor(() => expect(observed).toHaveBeenCalled());
    expect(observed.mock.calls[0][0]).toBeInstanceOf(RadiusApiImpl);
    expect(
      observed.mock.calls[0][1].filter(
        (flag: { name: string }) => flag.name === 'radius-catalog',
      ),
    ).toEqual([{ name: 'radius-catalog', pluginId: 'radius' }]);
    await waitFor(() =>
      expect(kubernetes.proxy).toHaveBeenCalledWith(
        expect.objectContaining({
          clusterName: 'host-selected-cluster',
          path: expect.stringContaining(
            '/providers/Radius.Core/resourceTypes/applications',
          ),
        }),
      ),
    );
    const tree = observed.mock.calls[0][2];
    const ids = [...tree.nodes.keys()].filter(
      (id: string) =>
        id.startsWith('page:radius/') || id === 'api:radius/radius',
    );
    expect(ids.sort()).toEqual([
      'api:radius/radius',
      'page:radius/applications',
      'page:radius/environment',
      'page:radius/environments',
      'page:radius/recipes',
      'page:radius/resource',
      'page:radius/resource-type',
      'page:radius/resource-types',
      'page:radius/resources',
    ]);
  });

  it('FS-06: uses a host Radius override instead of the default transport', async () => {
    const kubernetes = transport();
    const listResources = jest.fn().mockResolvedValue({ value: [] });
    renderTestApp({
      features: [radius],
      initialRouteEntries: ['/applications'],
      apis: [
        [kubernetesApiRef, kubernetes],
        [radiusApiRef, { listResources }],
      ],
    });
    expect(
      await screen.findByRole('heading', {
        name: 'Applications',
        level: 1,
      }),
    ).toBeInTheDocument();
    await waitFor(() => expect(listResources).toHaveBeenCalled());
    expect(kubernetes.proxy).not.toHaveBeenCalled();
  });

  it('FS-06: displays the host override failure without using a hidden transport', async () => {
    const kubernetes = transport();
    const listResources = jest
      .fn()
      .mockRejectedValue(new Error('Host connection is forbidden'));
    renderTestApp({
      features: [radius],
      initialRouteEntries: ['/applications'],
      apis: [
        [kubernetesApiRef, kubernetes],
        [radiusApiRef, { listResources }],
      ],
    });
    expect(
      await screen.findByText('Host connection is forbidden'),
    ).toBeInTheDocument();
    expect(kubernetes.proxy).not.toHaveBeenCalled();
  });

  it('FS-02: removing the native API makes the installed page fail lookup', async () => {
    renderTestApp({
      features: [radius],
      initialRouteEntries: ['/applications'],
      config: { app: { extensions: [{ 'api:radius/radius': false }] } },
      apis: [[kubernetesApiRef, transport()]],
    });
    expect(
      await screen.findByText(
        'No implementation available for apiRef{radius-api}',
      ),
    ).toBeInTheDocument();
  });

  it.each([FeatureFlagState.None, FeatureFlagState.Active])(
    'FS-04: keeps the host feature flag state %s',
    async state => {
      const flags = mockApis.featureFlags({
        initialStates: { 'radius-catalog': state },
      });
      const Probe = () => {
        const api = useApi(featureFlagsApiRef);
        return (
          <span>
            {api.isActive('radius-catalog')
              ? 'Catalog enabled'
              : 'Catalog disabled'}
          </span>
        );
      };
      renderTestApp({
        features: [radius],
        extensions: [
          AppRootElementBlueprint.make({
            name: 'flag-probe',
            params: { element: <Probe /> },
          }),
        ],
        apis: [flags, [kubernetesApiRef, transport()]],
      });
      expect(
        await screen.findByText(
          state === FeatureFlagState.Active
            ? 'Catalog enabled'
            : 'Catalog disabled',
        ),
      ).toBeInTheDocument();
    },
  );
  it('FS-01: disabling a required page removes its installed route', async () => {
    renderTestApp({
      features: [radius],
      initialRouteEntries: ['/applications'],
      config: { app: { extensions: [{ 'page:radius/applications': false }] } },
      apis: [[kubernetesApiRef, transport()]],
    });
    expect(await screen.findByText(/Page not found/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        name: 'Applications',
        level: 1,
      }),
    ).not.toBeInTheDocument();
  });
});
