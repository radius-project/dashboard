import {
  ApplicationProperties,
  EnvironmentProperties,
  Recipe,
  RecipeDefinition,
  RecipePackProperties,
  Resource,
  ResourceList,
} from './resource';

type IsExact<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;

type IsOptional<Type, Key extends keyof Type> =
  object extends Pick<Type, Key> ? true : false;

const assertType = <Condition extends true>(condition: Condition): Condition =>
  condition;

/**
 * `resource.ts` reexports the shared domain types every page reads and has no
 * runtime code. A conventional render test cannot reach it, and coverage cannot
 * see it, so the model could be reshaped without a single assertion failing even
 * though every page depends on the shape.
 *
 * These are therefore compile-time characterization tests. `assertType` checks
 * the exact property type and whether a key is optional, so the suite fails for
 * the intended model change rather than merely because an invalid literal
 * happens to produce some TypeScript error.
 */
describe('resource model', () => {
  it('RS-01: requires id, type, name, and properties without system metadata', () => {
    const resource: Resource = {
      id: '/planes/radius/local/resourceGroups/default/providers/Applications.Core/applications/demo-app',
      type: 'Applications.Core/applications',
      name: 'demo-app',
      properties: { provisioningState: 'Succeeded' },
    };

    expect(Object.keys(resource).sort()).toEqual([
      'id',
      'name',
      'properties',
      'type',
    ]);
  });

  it('RS-02: rejects a resource that omits its id', () => {
    expect(assertType<IsExact<IsOptional<Resource, 'id'>, false>>(true)).toBe(
      true,
    );
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

    expect(
      assertType<
        IsExact<IsOptional<ApplicationProperties, 'environment'>, false>
      >(true),
    ).toBe(true);
    expect(
      assertType<IsExact<ApplicationProperties['environment'], string>>(true),
    ).toBe(true);
    expect(application.properties.environment).toBe('/environment/default');
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
    expect(
      assertType<IsExact<IsOptional<RecipePackProperties, 'recipes'>, false>>(
        true,
      ),
    ).toBe(true);
    expect(
      assertType<
        IsExact<
          RecipePackProperties['recipes'],
          Record<string, RecipeDefinition>
        >
      >(true),
    ).toBe(true);
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

  it('RS-14: accepts optional, open-valued system metadata on typed resources', () => {
    const resource: Resource<ApplicationProperties> = {
      id: '/id',
      type: 'Applications.Core/applications',
      name: 'demo-app',
      systemData: {
        createdAt: '2026-11-16T18:00:00Z',
        createdBy: 'radius',
        lastModifiedAt: '2026-11-16T18:05:00Z',
        revision: 2,
        extension: { imported: true },
      },
      properties: {
        provisioningState: 'Succeeded',
        environment: '/environment/default',
      },
    };

    expect(
      assertType<IsExact<IsOptional<Resource, 'systemData'>, true>>(true),
    ).toBe(true);
    expect(
      assertType<
        IsExact<Resource['systemData'], Record<string, unknown> | undefined>
      >(true),
    ).toBe(true);
    expect(resource.systemData).toEqual({
      createdAt: '2026-11-16T18:00:00Z',
      createdBy: 'radius',
      lastModifiedAt: '2026-11-16T18:05:00Z',
      revision: 2,
      extension: { imported: true },
    });
  });
});
