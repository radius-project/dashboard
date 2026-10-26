import React from 'react';
import {
  ApiBlueprint,
  PageBlueprint,
  createFrontendPlugin,
} from '@backstage/frontend-plugin-api';
import {
  compatWrapper,
  convertLegacyRouteRefs,
} from '@backstage/core-compat-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes';
import { RadiusApiImpl } from './api/api';
import { radiusApiRef } from './api/ref';
import { featureRadiusCatalog } from './features';
import {
  applicationListPageRouteRef,
  environmentListPageRouteRef,
  environmentPageRouteRef,
  recipeListPageRouteRef,
  resourceListPageRouteRef,
  resourcePageRouteRef,
  resourceTypesListPageRouteRef,
  resourceTypeDetailPageRouteRef,
} from './routes';

const routes = convertLegacyRouteRefs({
  applications: applicationListPageRouteRef,
  environments: environmentListPageRouteRef,
  environment: environmentPageRouteRef,
  recipes: recipeListPageRouteRef,
  resources: resourceListPageRouteRef,
  resource: resourcePageRouteRef,
  resourceTypes: resourceTypesListPageRouteRef,
  resourceType: resourceTypeDetailPageRouteRef,
});

export default createFrontendPlugin({
  pluginId: 'radius',
  routes,
  featureFlags: [{ name: featureRadiusCatalog }],
  extensions: [
    ApiBlueprint.make({
      name: 'radius',
      params: defineParams =>
        defineParams({
          api: radiusApiRef,
          deps: { kubernetesApi: kubernetesApiRef },
          factory: ({ kubernetesApi }) => new RadiusApiImpl(kubernetesApi),
        }),
    }),
    PageBlueprint.make({
      name: 'applications',
      params: {
        path: '/applications',
        routeRef: routes.applications,
        noHeader: true,
        loader: () =>
          import('./components/applications').then(m =>
            compatWrapper(<m.ApplicationListPage />),
          ),
      },
    }),
    PageBlueprint.make({
      name: 'environments',
      params: {
        path: '/environments',
        routeRef: routes.environments,
        noHeader: true,
        loader: () =>
          import('./components/environments').then(m =>
            compatWrapper(<m.EnvironmentListPage />),
          ),
      },
    }),
    PageBlueprint.make({
      name: 'environment',
      params: {
        path: '/environments/:group/:namespace/:type/:name',
        routeRef: routes.environment,
        noHeader: true,
        loader: () =>
          import('./components/environments').then(m =>
            compatWrapper(<m.EnvironmentPage />),
          ),
      },
    }),
    PageBlueprint.make({
      name: 'recipes',
      params: {
        path: '/recipes',
        routeRef: routes.recipes,
        noHeader: true,
        loader: () =>
          import('./components/recipes').then(m =>
            compatWrapper(<m.RecipeListPage />),
          ),
      },
    }),
    PageBlueprint.make({
      name: 'resources',
      params: {
        path: '/resources',
        routeRef: routes.resources,
        noHeader: true,
        loader: () =>
          import('./components/resources').then(m =>
            compatWrapper(<m.ResourceListPage />),
          ),
      },
    }),
    PageBlueprint.make({
      name: 'resource',
      params: {
        path: '/resources/:group/:namespace/:type/:name',
        routeRef: routes.resource,
        noHeader: true,
        loader: () =>
          import('./components/resources').then(m =>
            compatWrapper(<m.ResourcePage />),
          ),
      },
    }),
    PageBlueprint.make({
      name: 'resource-types',
      params: {
        path: '/resource-types',
        routeRef: routes.resourceTypes,
        noHeader: true,
        loader: () =>
          import('./components/resourcetypes').then(m =>
            compatWrapper(<m.ResourceTypesListPage />),
          ),
      },
    }),
    PageBlueprint.make({
      name: 'resource-type',
      params: {
        path: '/resource-types/:namespace/:typeName',
        routeRef: routes.resourceType,
        noHeader: true,
        loader: () =>
          import('./components/resourcetypes').then(m =>
            compatWrapper(<m.ResourceTypeDetailPage />),
          ),
      },
    }),
  ],
});
