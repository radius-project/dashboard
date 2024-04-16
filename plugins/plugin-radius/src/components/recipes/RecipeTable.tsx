import React from 'react';
import { Table, TableColumn, TableFilter } from '@backstage/core-components';
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
    { title: 'Name', field: 'name' },
    { title: 'Type', field: 'type' },
    { title: 'Kind', field: 'templateKind' },
    { title: 'Template Path', field: 'templatePath' },
  ];

  const filters: TableFilter[] = [
    {
      column: 'Name',
      type: 'select',
    },
    {
      column: 'Type',
      type: 'multiple-select',
    },
    {
      column: 'Kind',
      type: 'multiple-select',
    },
    {
      column: 'Template Path',
      type: 'multiple-select',
    },
  ];

  return (
    <Table
      title={title || 'Recipes'}
      options={{ search: true, paging: false, sorting: true }}
      columns={columns}
      data={recipes}
      filters={filters}
    />
  );
};
