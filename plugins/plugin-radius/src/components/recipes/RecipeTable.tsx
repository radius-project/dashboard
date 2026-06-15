import React from 'react';
import { Table, TableColumn } from '@backstage/core-components';
import { DisplayRecipe } from './recipeAggregation';

export const RecipeTable = ({
  recipes,
  title,
}: {
  recipes: DisplayRecipe[];
  title?: string;
}) => {
  const columns: TableColumn<DisplayRecipe>[] = [
    { title: 'Recipe Pack', field: 'recipePack' },
    { title: 'Resource Type', field: 'type' },
    { title: 'Recipe Kind', field: 'recipeKind' },
    { title: 'Recipe Location', field: 'recipeLocation' },
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
