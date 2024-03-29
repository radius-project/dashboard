import {
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
import { RadiusApiImpl } from './api/api';
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
        kubernetesApi: kubernetesApiRef,
      },
      factory: (deps: { kubernetesApi: KubernetesApi }) => {
        return new RadiusApiImpl(deps.kubernetesApi);
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
