import {
  ConfigApi,
  configApiRef,
  createApiFactory,
  createApiRef,
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';

import {
  applicationListPageRouteRef,
  environmentListPageRouteRef,
  recipeListPageRouteRef,
  resourceListPageRouteRef,
  resourcePageRouteRef,
  rootRouteRef,
} from './routes';
import { RadiusApi } from './api';
import { KubernetesApi, kubernetesApiRef } from '@backstage/plugin-kubernetes';
import { DirectConnection, KubernetesConnection, RadiusApiImpl } from './api/api';
import { featureRadiusCatalog as featureRadiusCatalog } from './features';

export const radiusApiRef = createApiRef<RadiusApi>({
  id: 'radius-api',
});

export const radiusPlugin = createPlugin({
  id: 'radius',
  apis: [
    createApiFactory({
      api: radiusApiRef,
      deps: {
        configApi: configApiRef,
        kubernetesApi: kubernetesApiRef,
      },
      factory: (deps: { configApi: ConfigApi, kubernetesApi: KubernetesApi }) => {
        const connectionKind = deps.configApi.getOptionalString('radius.connection.kind') ?? 'kubernetes';
        if (connectionKind === 'kubernetes') {
          return new RadiusApiImpl(new KubernetesConnection(deps.kubernetesApi));
        } else if (connectionKind === 'direct') {
          return new RadiusApiImpl(new DirectConnection(`${deps.configApi.getString('backend.baseUrl')}/api/proxy/radius`));
        }

        throw new Error(`Unsupported connection kind: ${connectionKind}`);
      },
    }),
  ],
  featureFlags: [
    {
      name: featureRadiusCatalog,
    },
  ],
  routes: {
    root: rootRouteRef,
  },
});

export const EnvironmentListPage = radiusPlugin.provide(
  createRoutableExtension({
    name: 'Environments',
    component: () =>
      import('./components/environments').then(m => m.EnvironmentListPage),
    mountPoint: environmentListPageRouteRef,
  }),
);

export const ApplicationListPage = radiusPlugin.provide(
  createRoutableExtension({
    name: 'Applications',
    component: () =>
      import('./components/applications').then(m => m.ApplicationListPage),
    mountPoint: applicationListPageRouteRef,
  }),
);

export const RecipeListPage = radiusPlugin.provide(
  createRoutableExtension({
    name: 'recipes',
    component: () => import('./components/recipes').then(m => m.RecipeListPage),
    mountPoint: recipeListPageRouteRef,
  }),
);

export const ResourceListPage = radiusPlugin.provide(
  createRoutableExtension({
    name: 'Resources',
    component: () =>
      import('./components/resources').then(m => m.ResourceListPage),
    mountPoint: resourceListPageRouteRef,
  }),
);

export const ResourcePage = radiusPlugin.provide(
  createRoutableExtension({
    name: 'Resources',
    component: () => import('./components/resources').then(m => m.ResourcePage),
    mountPoint: resourcePageRouteRef,
  }),
);
