import React from 'react';
import { Table, TableColumn } from '@backstage/core-components';
import { EnvironmentProperties, Resource } from '../../resources';

interface DisplayRecipe {
  type: string;
  templatePath: string;
  templateKind: string;
}

export const RecipeTable = ({
  environment,
  title,
}: {
  environment: Resource<EnvironmentProperties>;
  title?: string;
}) => {
  const raw = environment.properties?.recipes;

  let recipes: DisplayRecipe[] = [];

  // Recipes are stored two-levels of nested object, so we need to flatten them out.
  // First level is the recipe type, second level is the recipe name.
  if (raw) {
    recipes = Object.keys(raw).flatMap(recipeType =>
      Object.keys(raw[recipeType]).map(recipeName => {
        return {
          type: recipeType,
          name: recipeName,
          ...raw[recipeType][recipeName],
        };
      }),
    );
  }

  const columns: TableColumn<DisplayRecipe>[] = [
    { title: 'Resource Type', field: 'type' },
    { title: 'Recipe Kind', field: 'templateKind' },
    { title: 'Recipe Location', field: 'templatePath' },
  ];

  return (
    <Table
      title={title}
      options={{ search: false, paging: false, sorting: true }}
      columns={columns}
      data={recipes}
    />
  );
};
