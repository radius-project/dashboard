export interface Resource<T = { [key: string]: unknown }> {
  id: string;
  type: string;
  name: string;
  tags?: Record<string, string>;
  systemData: Record<string, never>;
  properties: T;
}

export interface ResourceList<T = { [key: string]: unknown }> {
  value: Resource<T>[];
}

export interface ApplicationProperties {
  provisioningState: string;
  environment: string;
}

export interface Recipe {
  templateKind: string;
  templatePath: string;
}

export interface RecipeDefinition {
  recipeKind: string;
  recipeLocation: string;
  plainHttp?: boolean;
  parameters?: Record<string, unknown>;
}

export interface RecipePackProperties {
  provisioningState?: string;
  referencedBy?: string[];
  recipes: Record<string, RecipeDefinition>;
}

export interface EnvironmentProperties {
  provisioningState: string;
  recipes: Record<string, Record<string, Recipe>>;
  // Only present on Radius.Core/environments. Legacy Applications.Core/environments
  // continues to use the inline `recipes` map above and never references recipe packs.
  recipePacks?: string[];
  compute?: {
    namespace?: string;
    kubernetes?: {
      namespace?: string;
    };
  };
  providers?: {
    azure?: {
      scope?: string;
      subscriptionId?: string;
      resourceGroup?: string;
    };
    aws?: {
      scope?: string;
      accountId?: string;
      region?: string;
    };
  };
}
