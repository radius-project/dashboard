import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderTestApp } from '@backstage/frontend-test-utils';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import catalog from '@backstage/plugin-catalog/alpha';
import catalogGraph from '@backstage/plugin-catalog-graph/alpha';
import {
  AppRootElementBlueprint,
  appThemeApiRef,
  appTreeApiRef,
  featureFlagsApiRef,
  useApi,
  type AppTree,
  alertApiRef,
  dialogApiRef,
} from '@backstage/frontend-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes';
import { bindCatalogRoutes, catalogApiFactory, features } from './App';

const kubernetes = {
  getClusters: jest
    .fn()
    .mockResolvedValue([
      { name: 'app-test-cluster', authProvider: 'serviceAccount' },
    ]),
  proxy: jest
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ value: [] }))),
};
const config = {
  app: {
    baseUrl: 'http://localhost:3000',
    extensions: [{ 'sign-in-page:app': false }],
  },
  backend: { baseUrl: 'http://localhost:7007' },
};

describe('standalone native host', () => {
  it('AP-04: creates the catalog API within the catalog module', () => {
    const api = catalogApiFactory.factory({
      discoveryApi: {
        getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007'),
      },
      fetchApi: { fetch: jest.fn() },
    });

    expect(catalogApiFactory.api).toBe(catalogApiRef);
    expect(api.getEntityByName).toEqual(expect.any(Function));
  });

  it('AP-05: binds the catalog graph entity route to the catalog page', () => {
    const bind = jest.fn();

    bindCatalogRoutes({ bind });

    expect(bind).toHaveBeenCalledWith(catalogGraph.externalRoutes, {
      catalogEntity: catalog.routes.catalogEntity,
    });
  });

  it('FS-09/10: installs one Radius page/API set and keeps default alerts and dialogs', async () => {
    const observed = jest.fn<void, [AppTree, string[], string[]]>();
    const Probe = () => {
      const tree = useApi(appTreeApiRef);
      const themes = useApi(appThemeApiRef);
      const flags = useApi(featureFlagsApiRef);
      React.useEffect(() => {
        observed(
          tree.getTree().tree,
          themes.getInstalledThemes().map(theme => theme.id),
          flags
            .getRegisteredFlags()
            .filter(flag => flag.name === 'radius-catalog')
            .map(flag => flag.name),
        );
      }, [tree, themes, flags]);
      return null;
    };
    renderTestApp({
      features,
      config,
      initialRouteEntries: ['/applications'],
      apis: [[kubernetesApiRef, kubernetes]],
      extensions: [
        AppRootElementBlueprint.make({
          name: 'host-probe',
          params: { element: <Probe /> },
        }),
      ],
    });
    expect(
      await screen.findByRole('heading', { name: 'Applications', level: 1 }),
    ).toBeInTheDocument();
    await waitFor(() => expect(observed).toHaveBeenCalled());
    const [tree, themes, flags] = observed.mock.calls[0];
    const nodes = [...tree.nodes.values()].filter(node => node.instance);
    expect(
      nodes.filter(node => node.spec.id.startsWith('page:radius/')),
    ).toHaveLength(8);
    expect(
      nodes.filter(node => node.spec.id === 'api:radius/radius'),
    ).toHaveLength(1);
    expect(flags).toEqual(['radius-catalog']);
    expect(themes.sort()).toEqual(['dark', 'light']);
    expect(nodes.map(node => node.spec.id)).toEqual(
      expect.arrayContaining([
        'app-root-element:app/alert-display',
        'app-root-element:app/oauth-request-dialog',
        'app-root-element:app/dialog-display',
      ]),
    );
  });

  it('FS-11: preserves the home cards and sidebar through installed composition', async () => {
    renderTestApp({
      features,
      config,
      initialRouteEntries: ['/'],
      apis: [[kubernetesApiRef, kubernetes]],
    });
    expect(await screen.findByText('Learn more')).toBeInTheDocument();
    expect(screen.getByText('Join the community')).toBeInTheDocument();
    expect(screen.getByText('Get help with Radius')).toBeInTheDocument();
    expect(screen.getAllByText('Applications', { exact: true })).toHaveLength(
      2,
    );
    expect(screen.getAllByText('Environments', { exact: true })).toHaveLength(
      2,
    );
    for (const name of [
      'Resource Types',
      'Environments',
      'Applications',
      'Resources',
      'Recipes',
    ]) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
  });

  it('FS-09: delivers alerts and dialogs through the default app extensions', async () => {
    const Controls = () => {
      const alerts = useApi(alertApiRef);
      const dialogs = useApi(dialogApiRef);
      return (
        <button
          onClick={() => {
            alerts.post({
              message: 'Host alert reached the display',
              severity: 'info',
            });
            dialogs.open(
              <div role="dialog" aria-label="Host dialog">
                Host dialog reached the display
              </div>,
            );
          }}
        >
          Exercise host displays
        </button>
      );
    };
    renderTestApp({
      features,
      config,
      initialRouteEntries: ['/applications'],
      apis: [[kubernetesApiRef, kubernetes]],
      extensions: [
        AppRootElementBlueprint.make({
          name: 'host-controls',
          params: { element: <Controls /> },
        }),
      ],
    });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Exercise host displays' }),
    );
    expect(
      await screen.findByText('Host alert reached the display'),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('dialog', { name: 'Host dialog' }),
    ).toHaveTextContent('Host dialog reached the display');
  });
});
