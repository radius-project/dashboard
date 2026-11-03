import { aggregateRecipes, DisplayRecipe } from '@radius-project/core/domain';
import {
  EnvironmentProperties,
  RecipePackProperties,
  Resource,
} from '../../resources';

export type { DisplayRecipe } from '@radius-project/core/domain';

export function aggregateRecipesFromEnvironment(
  environment: Resource<EnvironmentProperties>,
  packsById: Record<string, Resource<RecipePackProperties>>,
): DisplayRecipe[] {
  return aggregateRecipes(environment.properties, packsById);
}

export function aggregateRecipesFromPack(
  pack: Resource<RecipePackProperties>,
): DisplayRecipe[] {
  return aggregateRecipes({ recipePacks: [pack.id] }, { [pack.id]: pack });
}
