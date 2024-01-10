import React from 'react';
import { EnvironmentProperties, Resource } from '../../resources';
import { RecipeTable } from '../recipes/RecipeTable';

export const RecipesTab = ({
  resource,
}: {
  resource: Resource<EnvironmentProperties>;
}) => {
  return (
    <RecipeTable
      environment={resource}
      title={`Recipes for ${resource.name}`}
    />
  );
};
