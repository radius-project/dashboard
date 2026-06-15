import { parseResourceId } from '@radapp.io/rad-components';
import {
  EnvironmentProperties,
  RecipePackProperties,
  Resource,
} from '../../resources';

export interface DisplayRecipe {
  recipePack: string;
  type: string;
  recipeKind: string;
  recipeLocation: string;
}

/**
 * Aggregate the recipes that should be displayed for an environment.
 *
 * - Legacy `Applications.Core/environments` carry recipes inline via
 *   `properties.recipes`. The Recipe Pack column is left blank for those rows.
 * - `Radius.Core/environments` reference one or more `Radius.Core/recipePacks`
 *   via `properties.recipePacks`. Recipes come from each linked pack and the
 *   Recipe Pack column shows the parsed pack name.
 */
export function aggregateRecipesFromEnvironment(
  environment: Resource<EnvironmentProperties>,
  packsById: Record<string, Resource<RecipePackProperties>>,
): DisplayRecipe[] {
  const result: DisplayRecipe[] = [];

  // Legacy: inline recipes map.
  const inline = environment.properties?.recipes;
  if (inline) {
    for (const resourceType of Object.keys(inline)) {
      const recipesForType = inline[resourceType] ?? {};
      for (const recipeName of Object.keys(recipesForType)) {
        const recipe = recipesForType[recipeName];
        result.push({
          recipePack: '',
          type: resourceType,
          recipeKind: recipe.templateKind,
          recipeLocation: recipe.templatePath,
        });
      }
    }
  }

  // New: linked recipe packs. UCP can return resource ids in mixed casing
  // (e.g. lowercase `resourcegroups`) so we look up packs case-insensitively.
  const packIds = environment.properties?.recipePacks;
  if (packIds) {
    const normalizedPacks: Record<string, Resource<RecipePackProperties>> = {};
    for (const id of Object.keys(packsById)) {
      normalizedPacks[id.toLowerCase()] = packsById[id];
    }
    for (const packId of packIds) {
      const pack = normalizedPacks[packId.toLowerCase()];
      if (!pack) {
        // Pack not found (perhaps deleted or not yet loaded); skip gracefully.
        continue;
      }
      result.push(...aggregateRecipesFromPack(pack));
    }
  }

  return result;
}

/**
 * Aggregate the recipes contained in a single recipe pack into the unified
 * display shape. The Recipe Pack column is set to the pack's parsed name.
 */
export function aggregateRecipesFromPack(
  pack: Resource<RecipePackProperties>,
): DisplayRecipe[] {
  const packName = parseResourceId(pack.id)?.name ?? pack.name;
  const recipes = pack.properties?.recipes ?? {};
  return Object.keys(recipes).map(resourceType => {
    const definition = recipes[resourceType];
    return {
      recipePack: packName,
      type: resourceType,
      recipeKind: definition.kind,
      recipeLocation: definition.source,
    };
  });
}
