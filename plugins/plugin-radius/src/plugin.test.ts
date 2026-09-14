import { radiusPlugin, radiusApiRef, RadiusApi } from './plugin';
import * as publicApi from './index';
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
import { featureRadiusCatalog } from './features';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes';

/**
 * Phase 3 contract tests.
 *
 * These pin the surface an external Backstage host consumes, so a change here is
 * a breaking change for consumers. The assertions are deliberately literal: they
 * restate the expected value rather than deriving it from the source, so that
 * editing the source alone cannot make them pass.
 */
describe('plugin contract', () => {
  it('PU-01: exposes the plugin id consumers register against', () => {
    expect(radiusPlugin.getId()).toBe('radius');
  });

  it('PU-02: exposes exactly the documented public exports', () => {
    expect(Object.keys(publicApi).sort()).toEqual([
      'ApplicationIcon',
      'ApplicationListInfoCard',
      'ApplicationListPage',
      'EnvironmentIcon',
      'EnvironmentListInfoCard',
      'EnvironmentListPage',
      'EnvironmentPage',
      'RadiusLogo',
      'RadiusLogomarkReverse',
      'RecipeIcon',
      'RecipeListPage',
      'ResourceIcon',
      'ResourceListPage',
      'ResourcePage',
      'ResourceTypeDetailPage',
      'ResourceTypesListPage',
      'applicationListPageRouteRef',
      'environmentListPageRouteRef',
      'environmentPageRouteRef',
      'featureRadiusCatalog',
      'radiusApiRef',
      'radiusPlugin',
      'recipeListPageRouteRef',
      'resourceListPageRouteRef',
      'resourcePageRouteRef',
      'resourceTypeDetailPageRouteRef',
      'resourceTypesListPageRouteRef',
    ]);
  });

  it('PU-03: pins every route ref id', () => {
    const idOf = (ref: unknown) => (ref as { id: string }).id;

    expect(idOf(rootRouteRef)).toBe('radius');
    expect(idOf(applicationListPageRouteRef)).toBe(
      'radius-application-list-page',
    );
    expect(idOf(environmentListPageRouteRef)).toBe(
      'radius-environment-list-page',
    );
    expect(idOf(environmentPageRouteRef)).toBe('radius-environment-page');
    expect(idOf(recipeListPageRouteRef)).toBe('radius-recipe-list-page');
    expect(idOf(resourceListPageRouteRef)).toBe('radius-resource-list-page');
    expect(idOf(resourcePageRouteRef)).toBe('radius-resource-page');
    expect(idOf(resourceTypesListPageRouteRef)).toBe(
      'radius-resource-types-list-page',
    );
    expect(idOf(resourceTypeDetailPageRouteRef)).toBe(
      'radius-resource-type-detail-page',
    );
  });

  it('PU-04: pins route ref parameters, which callers must supply', () => {
    const paramsOf = (ref: unknown) =>
      [...((ref as { params?: string[] }).params ?? [])].sort();

    expect(paramsOf(rootRouteRef)).toEqual([]);
    expect(paramsOf(applicationListPageRouteRef)).toEqual([]);
    expect(paramsOf(environmentListPageRouteRef)).toEqual([]);
    expect(paramsOf(recipeListPageRouteRef)).toEqual([]);
    expect(paramsOf(resourceListPageRouteRef)).toEqual([]);
    expect(paramsOf(resourceTypesListPageRouteRef)).toEqual([]);

    expect(paramsOf(resourceTypeDetailPageRouteRef)).toEqual([
      'namespace',
      'typeName',
    ]);
    expect(paramsOf(resourcePageRouteRef)).toEqual([
      'group',
      'name',
      'namespace',
      'type',
    ]);
    expect(paramsOf(environmentPageRouteRef)).toEqual([
      'group',
      'name',
      'namespace',
      'type',
    ]);
  });

  it('PU-05: binds the root route ref into the plugin route map', () => {
    expect(Object.keys(radiusPlugin.routes)).toEqual(['root']);
    expect(radiusPlugin.routes.root).toBe(rootRouteRef);
  });

  it('PU-06: pins the api ref id that hosts override against', () => {
    expect(radiusApiRef.id).toBe('radius-api');
  });

  it('PU-07: registers exactly one api factory, bound to the radius api ref', () => {
    const factories = [...radiusPlugin.getApis()];

    expect(factories).toHaveLength(1);
    expect(factories[0].api.id).toBe('radius-api');
  });

  it('PU-07a: executes the registered factory against the Kubernetes request contract', async () => {
    const factory = [...radiusPlugin.getApis()][0];
    const getClusters = jest
      .fn()
      .mockResolvedValue([
        { name: 'phase3-cluster', authProvider: 'serviceAccount' },
      ]);
    const proxy = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          Name: 'applications',
          Description: 'Application resource type',
          ResourceProviderNamespace: 'Radius.Core',
          APIVersions: { '2025-01-01': {} },
          APIVersionList: ['2025-01-01'],
        }),
        { status: 200 },
      ),
    );

    expect(factory.deps).toEqual({ kubernetesApi: kubernetesApiRef });
    const api = factory.factory({
      kubernetesApi: { getClusters, proxy },
    }) as RadiusApi;

    await expect(
      api.getResourceType({
        namespace: 'Radius.Core',
        typeName: 'applications',
        clusterName: 'phase3-cluster',
      }),
    ).resolves.toMatchObject({
      Name: 'applications',
      ResourceProviderNamespace: 'Radius.Core',
    });
    expect(proxy).toHaveBeenCalledWith(
      expect.objectContaining({
        clusterName: 'phase3-cluster',
        path: expect.stringContaining(
          '/providers/Radius.Core/resourceTypes/applications',
        ),
      }),
    );
  });

  it('PU-08: declares the radius catalog feature flag', () => {
    expect(featureRadiusCatalog).toBe('radius-catalog');
    expect([...radiusPlugin.getFeatureFlags()]).toEqual([
      { name: 'radius-catalog' },
    ]);
  });

  it('PU-09: exposes every routable page as a named extension', () => {
    const named = Object.entries(publicApi)
      .map(([key, value]) => [
        key,
        (value as { displayName?: string })?.displayName,
      ])
      .filter(([, displayName]) => typeof displayName === 'string');

    expect(Object.fromEntries(named)).toEqual({
      ApplicationListPage: 'Extension(Applications)',
      EnvironmentListPage: 'Extension(Environments)',
      EnvironmentPage: 'Extension(Environments)',
      RecipeListPage: 'Extension(recipes)',
      ResourceListPage: 'Extension(Resources)',
      ResourcePage: 'Extension(Resources)',
      ResourceTypeDetailPage: 'Extension(Resource Type Detail)',
      ResourceTypesListPage: 'Extension(Resource Types)',
    });
  });

  it('PU-10: exposes the api ref from the package entry point', () => {
    expect(publicApi.radiusApiRef).toBe(radiusApiRef);
  });
});
