import {
  ApplicationProperties,
  EnvironmentProperties,
  Recipe,
  RecipeDefinition,
  RecipePackProperties,
  Resource,
  ResourceList,
} from './resource';

/**
 * `resource.ts` is the domain model every page reads, and it is the one file in
 * Appendix F with no runtime code at all: it declares interfaces and nothing
 * else. A conventional render test cannot reach it, and coverage cannot see it,
 * so the model could be reshaped without a single assertion failing even though
 * every page depends on the shape.
 *
 * These are therefore compile-time characterization tests. Each `@ts-expect-error`
 * asserts that a shape the model must reject *is* rejected, and fails `yarn tsc`
 * if the model is widened; the runtime assertions keep the cases executable and
 * readable. Both halves matter: dropping a required field makes an
 * `@ts-expect-error` stop erroring, which is itself a compile failure.
 */
describe('resource model', () => {
  it('RS-01: requires id, type, name, systemData, and properties on every resource', () => {
    const resource: Resource = {
      id: '/planes/radius/local/resourceGroups/default/providers/Applications.Core/applications/demo-app',
      type: 'Applications.Core/applications',
      name: 'demo-app',
      systemData: {},
      properties: { provisioningState: 'Succeeded' },
    };

    expect(Object.keys(resource).sort()).toEqual([
      'id',
      'name',
      'properties',
      'systemData',
      'type',
    ]);
  });

  it('RS-02: rejects a resource that omits its id', () => {
    // @ts-expect-error `id` is required; widening the model breaks every link.
    const resource: Resource = {
      type: 'Applications.Core/applications',
      name: 'demo-app',
      systemData: {},
      properties: {},
    };

    expect(resource.id).toBeUndefined();
  });

  it('RS-03: treats tags as optional and string-valued', () => {
    const tagged: Resource = {
      id: '/id',
      type: 'Applications.Core/applications',
      name: 'demo-app',
      systemData: {},
      properties: {},
      tags: { owner: 'platform' },
    };

    const untagged: Resource = {
      id: '/id',
      type: 'Applications.Core/applications',
      name: 'demo-app',
      systemData: {},
      properties: {},
    };

    expect(tagged.tags).toEqual({ owner: 'platform' });
    expect(untagged.tags).toBeUndefined();
  });

  it('RS-04: defaults the properties bag to an open string-keyed record', () => {
    const resource: Resource = {
      id: '/id',
      type: 'Radius.Data/redisCaches',
      name: 'cache',
      systemData: {},
      properties: { host: 'localhost', port: 6379 },
    };

    expect(resource.properties.port).toBe(6379);
  });

  it('RS-05: narrows the properties bag when a type argument is supplied', () => {
    const application: Resource<ApplicationProperties> = {
      id: '/id',
      type: 'Applications.Core/applications',
      name: 'demo-app',
      systemData: {},
      properties: {
        provisioningState: 'Succeeded',
        environment: '/environment/default',
      },
    };

    const incomplete: Resource<ApplicationProperties> = {
      id: '/id',
      type: 'Applications.Core/applications',
      name: 'demo-app',
      systemData: {},
      // @ts-expect-error `environment` is required on ApplicationProperties.
      properties: { provisioningState: 'Succeeded' },
    };

    expect(application.properties.environment).toBe('/environment/default');
    expect(incomplete.properties.environment).toBeUndefined();
  });

  it('RS-06: wraps list responses in a single value array, matching the UCP envelope', () => {
    const list: ResourceList<ApplicationProperties> = {
      value: [
        {
          id: '/id',
          type: 'Applications.Core/applications',
          name: 'demo-app',
          systemData: {},
          properties: {
            provisioningState: 'Succeeded',
            environment: '/environment/default',
          },
        },
      ],
    };

    expect(Object.keys(list)).toEqual(['value']);
    expect(list.value).toHaveLength(1);
  });

  /**
   * The two recipe shapes are the single most error-prone part of this model,
   * because both are called `recipes` and both are keyed by resource type, but
   * they nest differently and carry different value types. RS-07 and RS-08 pin
   * the difference so it cannot be quietly unified.
   */
  it('RS-07: nests legacy environment recipes by resource type and then by recipe name', () => {
    const environment: Resource<EnvironmentProperties> = {
      id: '/id',
      type: 'Applications.Core/environments',
      name: 'demo-env',
      systemData: {},
      properties: {
        provisioningState: 'Succeeded',
        recipes: {
          'Applications.Datastores/redisCaches': {
            default: {
              templateKind: 'bicep',
              templatePath: 'ghcr.io/radius-project/recipes/redis:latest',
            },
          },
        },
      },
    };

    const recipe: Recipe =
      environment.properties.recipes['Applications.Datastores/redisCaches']
        .default;

    expect(recipe.templateKind).toBe('bicep');
    expect(recipe.templatePath).toBe(
      'ghcr.io/radius-project/recipes/redis:latest',
    );
  });

  it('RS-08: keys recipe pack recipes by resource type directly, with no recipe-name level', () => {
    const pack: Resource<RecipePackProperties> = {
      id: '/id',
      type: 'Radius.Core/recipePacks',
      name: 'demo-pack',
      systemData: {},
      properties: {
        recipes: {
          'Radius.Data/redisCaches': {
            kind: 'bicep',
            source: 'ghcr.io/radius-project/recipes/redis:latest',
          },
        },
      },
    };

    const definition: RecipeDefinition =
      pack.properties.recipes['Radius.Data/redisCaches'];

    // A pack recipe uses kind/source; a legacy recipe uses
    // templateKind/templatePath. They are not interchangeable.
    expect(Object.keys(definition).sort()).toEqual(['kind', 'source']);
  });

  it('RS-09: makes the pack recipe fields beyond kind and source optional', () => {
    const minimal: RecipeDefinition = { kind: 'bicep', source: 'oci://demo' };
    const full: RecipeDefinition = {
      kind: 'terraform',
      source: 'git::https://example.invalid/module',
      plainHttp: true,
      parameters: { size: 'small' },
    };

    expect(minimal.plainHttp).toBeUndefined();
    expect(full.parameters).toEqual({ size: 'small' });
  });

  it('RS-10: requires recipes on a pack, so an empty pack is an explicit empty map', () => {
    // @ts-expect-error `recipes` is required even when a pack carries none.
    const pack: RecipePackProperties = { provisioningState: 'Succeeded' };

    expect(pack.recipes).toBeUndefined();
  });

  it('RS-11: makes recipePacks optional, because only Radius.Core environments carry it', () => {
    const legacy: EnvironmentProperties = {
      provisioningState: 'Succeeded',
      recipes: {},
    };

    const modern: EnvironmentProperties = {
      provisioningState: 'Succeeded',
      recipes: {},
      recipePacks: [
        '/planes/radius/local/resourceGroups/default/providers/Radius.Core/recipePacks/demo-pack',
      ],
    };

    expect(legacy.recipePacks).toBeUndefined();
    expect(modern.recipePacks).toHaveLength(1);
  });

  it('RS-12: models both the flat and the nested Kubernetes namespace on compute', () => {
    const environment: EnvironmentProperties = {
      provisioningState: 'Succeeded',
      recipes: {},
      compute: { namespace: 'flat', kubernetes: { namespace: 'nested' } },
    };

    expect(environment.compute?.namespace).toBe('flat');
    expect(environment.compute?.kubernetes?.namespace).toBe('nested');
  });

  it('RS-13: models Azure and AWS providers as independent optional blocks', () => {
    const environment: EnvironmentProperties = {
      provisioningState: 'Succeeded',
      recipes: {},
      providers: {
        azure: { scope: '/subscriptions/demo', subscriptionId: 'demo' },
      },
    };

    expect(environment.providers?.azure?.subscriptionId).toBe('demo');
    expect(environment.providers?.aws).toBeUndefined();
  });

  /**
   * KNOWN-DEFECT, tracked by radius-project/dashboard#365.
   *
   * `systemData` is declared `Record<string, never>` and is required. The value
   * type says "an object whose every property is of type `never`", which is
   * satisfiable only by `{}` -- so the model can represent the field being
   * present and empty, and nothing else. Real UCP responses return a populated
   * `systemData` (`createdAt`, `createdBy`, and so on), and several resources
   * the dashboard reads do not return it at all.
   *
   * The consequence is visible across the suite: because the field is required
   * and unfillable, test fixtures cannot be written as plain typed literals and
   * are cast with `as Resource<...>` instead, which discards checking of every
   * other field at the same time. A modelling choice meant to tighten the type
   * ended up being the reason the fixtures are untyped.
   *
   * Correct behavior is an optional field with an open value type. This test
   * records what the model does today.
   */
  it('RS-14: KNOWN-DEFECT systemData is required and can only ever be empty', () => {
    const resource: Resource = {
      id: '/id',
      type: 'Applications.Core/applications',
      name: 'demo-app',
      systemData: {},
      properties: {},
    };

    // @ts-expect-error a populated systemData -- what UCP actually returns --
    // does not satisfy Record<string, never>.
    resource.systemData = { createdAt: '2026-09-01T00:00:00Z' };

    // @ts-expect-error and the field cannot be omitted either.
    const withoutSystemData: Resource = {
      id: '/id',
      type: 'Applications.Core/applications',
      name: 'demo-app',
      properties: {},
    };

    expect(resource.systemData).toEqual({
      createdAt: '2026-09-01T00:00:00Z',
    });
    expect(withoutSystemData.systemData).toBeUndefined();
  });
});
