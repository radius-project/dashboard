import {
  createApiFactory,
  createApiRef,
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';

import {
  applicationListPageRouteRef,
  environmentListPageRouteRef,
  environmentPageRouteRef,
  recipeListPageRouteRef,
  resourceListPageRouteRef,
  resourceTypesListPageRouteRef,
  resourceTypeDetailPageRouteRef,
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

export const EnvironmentPage = radiusPlugin.provide(
  createRoutableExtension({
    name: 'Environments',
    component: () =>
      import('./components/environments').then(m => m.EnvironmentPage),
    mountPoint: environmentPageRouteRef,
  }),
);
    
export const ResourceTypesListPage = radiusPlugin.provide(
  createRoutableExtension({
    name: 'Resource Types',
    component: () =>
      import('./components/resourcetypes').then(m => m.ResourceTypesListPage),
    mountPoint: resourceTypesListPageRouteRef,
  }),
);

export const ResourceTypeDetailPage = radiusPlugin.provide(
  createRoutableExtension({
    name: 'Resource Type Detail',
    component: () =>
      import('./components/resourcetypes').then(m => m.ResourceTypeDetailPage),
    mountPoint: resourceTypeDetailPageRouteRef,
  }),
);
