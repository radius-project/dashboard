import {
  EnvironmentProperties,
  RecipePackProperties,
  Resource,
} from '../../resources';
import {
  aggregateRecipesFromEnvironment,
  aggregateRecipesFromPack,
} from './recipeAggregation';

const PACK_ID =
  '/planes/radius/local/resourceGroups/default/providers/Radius.Core/recipePacks/aca-recipe-pack';
const OTHER_PACK_ID =
  '/planes/radius/local/resourceGroups/default/providers/Radius.Core/recipePacks/other-pack';

const pack: Resource<RecipePackProperties> = {
  id: PACK_ID,
  type: 'Radius.Core/recipePacks',
  name: 'aca-recipe-pack',
  systemData: {} as Record<string, never>,
  properties: {
    recipes: {
      'Applications.Dapr/stateStores': {
        kind: 'bicep',
        source: 'ghcr.io/willtsai/recipes/aca-dapr-statestores:v0.10',
      },
      'Radius.Compute/containers': {
        kind: 'bicep',
        source: 'ghcr.io/willtsai/recipes/aca-containers:v0.10',
      },
    },
  },
};

const otherPack: Resource<RecipePackProperties> = {
  id: OTHER_PACK_ID,
  type: 'Radius.Core/recipePacks',
  name: 'other-pack',
  systemData: {} as Record<string, never>,
  properties: {
    recipes: {
      'Applications.Datastores/redisCaches': {
        kind: 'terraform',
        source: 'ghcr.io/willtsai/recipes/redis:v0.1',
      },
    },
  },
};

const legacyEnvironment: Resource<EnvironmentProperties> = {
  id: '/planes/radius/local/resourceGroups/default/providers/Applications.Core/environments/legacy',
  type: 'Applications.Core/environments',
  name: 'legacy',
  systemData: {} as Record<string, never>,
  properties: {
    provisioningState: 'Succeeded',
    recipes: {
      'Applications.Dapr/stateStores': {
        legacyRecipe: {
          templateKind: 'bicep',
          templatePath: 'ghcr.io/willtsai/recipes/aca-dapr-statestores:v0.10',
        },
      },
      'Radius.Compute/containers': {
        legacyRecipe: {
          templateKind: 'bicep',
          templatePath: 'ghcr.io/willtsai/recipes/aca-containers:v0.10',
        },
      },
    },
  },
};

const newEnvironment: Resource<EnvironmentProperties> = {
  id: '/planes/radius/local/resourceGroups/default/providers/Radius.Core/environments/new',
  type: 'Radius.Core/environments',
  name: 'new',
  systemData: {} as Record<string, never>,
  properties: {
    provisioningState: 'Succeeded',
    recipes: {} as EnvironmentProperties['recipes'],
    recipePacks: [PACK_ID],
  },
};

describe('aggregateRecipesFromEnvironment', () => {
  it('flattens inline recipes for a legacy environment with blank recipe pack', () => {
    const recipes = aggregateRecipesFromEnvironment(legacyEnvironment, {});
    expect(recipes).toHaveLength(2);
    expect(recipes.every(r => r.recipePack === '')).toBe(true);
    expect(recipes).toEqual(
      expect.arrayContaining([
        {
          recipePack: '',
          type: 'Applications.Dapr/stateStores',
          kind: 'bicep',
          source: 'ghcr.io/willtsai/recipes/aca-dapr-statestores:v0.10',
        },
        {
          recipePack: '',
          type: 'Radius.Compute/containers',
          kind: 'bicep',
          source: 'ghcr.io/willtsai/recipes/aca-containers:v0.10',
        },
      ]),
    );
  });

  it('resolves recipes from linked recipe packs for a new environment', () => {
    const recipes = aggregateRecipesFromEnvironment(newEnvironment, {
      [PACK_ID]: pack,
    });
    expect(recipes).toHaveLength(2);
    expect(recipes.every(r => r.recipePack === 'aca-recipe-pack')).toBe(true);
  });

  it('aggregates recipes from multiple linked packs', () => {
    const env: Resource<EnvironmentProperties> = {
      ...newEnvironment,
      properties: {
        ...newEnvironment.properties,
        recipePacks: [PACK_ID, OTHER_PACK_ID],
      },
    };
    const recipes = aggregateRecipesFromEnvironment(env, {
      [PACK_ID]: pack,
      [OTHER_PACK_ID]: otherPack,
    });
    expect(recipes).toHaveLength(3);
    expect(recipes.map(r => r.recipePack).sort()).toEqual([
      'aca-recipe-pack',
      'aca-recipe-pack',
      'other-pack',
    ]);
  });

  it('skips unknown pack ids without throwing', () => {
    const env: Resource<EnvironmentProperties> = {
      ...newEnvironment,
      properties: {
        ...newEnvironment.properties,
        recipePacks: [PACK_ID, '/missing/pack/id'],
      },
    };
    const recipes = aggregateRecipesFromEnvironment(env, {
      [PACK_ID]: pack,
    });
    expect(recipes).toHaveLength(2);
  });
});

describe('aggregateRecipesFromPack', () => {
  it('flattens recipes for a single recipe pack', () => {
    const recipes = aggregateRecipesFromPack(pack);
    expect(recipes).toHaveLength(2);
    expect(recipes.every(r => r.recipePack === 'aca-recipe-pack')).toBe(true);
    expect(recipes).toEqual(
      expect.arrayContaining([
        {
          recipePack: 'aca-recipe-pack',
          type: 'Applications.Dapr/stateStores',
          kind: 'bicep',
          source: 'ghcr.io/willtsai/recipes/aca-dapr-statestores:v0.10',
        },
      ]),
    );
  });
});
