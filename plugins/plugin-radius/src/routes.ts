import { createRouteRef } from '@backstage/core-plugin-api';

export const rootRouteRef = createRouteRef({
  id: 'radius',
});

export const applicationListPageRouteRef = createRouteRef({
  id: 'radius-application-list-page',
});

export const environmentListPageRouteRef = createRouteRef({
  id: 'radius-environment-list-page',
});

export const recipeListPageRouteRef = createRouteRef({
  id: 'radius-recipe-list-page',
});

export const resourceListPageRouteRef = createRouteRef({
  id: 'radius-resource-list-page',
});

export const resourceTypesListPageRouteRef = createRouteRef({
  id: 'radius-resource-types-list-page',
});

export const resourceTypeDetailPageRouteRef = createRouteRef({
  id: 'radius-resource-type-detail-page',
  params: ['namespace', 'typeName'],
});

export const resourcePageRouteRef = createRouteRef({
  id: 'radius-resource-page',
  params: ['group', 'namespace', 'type', 'name'],
});

export const environmentPageRouteRef = createRouteRef({
  id: 'radius-environment-page',
  params: ['group', 'namespace', 'type', 'name'],
});
