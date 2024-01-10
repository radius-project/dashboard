import React from 'react';
import { Table, TableColumn } from '@backstage/core-components';
import { EnvironmentProperties, Resource } from '../../resources';

interface DisplayRecipe {
  name: string;
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

  // Recipes are stored two-levels of nested object, so we need to flatten them out.
  // First level is the recipe type, second level is the recipe name.
  const recipes = Object.keys(raw).flatMap(recipeType =>
    Object.keys(raw[recipeType]).map(recipeName => {
      return {
        type: recipeType,
        name: recipeName,
        ...raw[recipeType][recipeName],
      };
    }),
  );

  const columns: TableColumn<DisplayRecipe>[] = [
    { title: 'Name', field: 'name' },
    { title: 'Type', field: 'type' },
    { title: 'Kind', field: 'templateKind' },
    { title: 'Template Path', field: 'templatePath' },
  ];

  return (
    <Table
      title={title || 'Recipes'}
      options={{ search: false, paging: false }}
      columns={columns}
      data={recipes}
    />
  );
};
