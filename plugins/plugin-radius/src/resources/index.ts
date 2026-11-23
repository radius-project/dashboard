export type {
  Resource,
  ResourceList,
  ApplicationProperties,
  EnvironmentProperties,
  Recipe,
  RecipeDefinition,
  RecipePackProperties,
  ResourceType,
  ResourceTypeProperties,
} from './resource';

export {
  isEnvironmentType,
  isApplicationType,
  getEquivalentTypes,
} from './resourceTypes';
