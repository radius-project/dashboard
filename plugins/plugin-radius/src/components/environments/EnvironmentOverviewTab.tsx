import React from 'react';
import { EnvironmentProperties, Resource } from '../../resources';
import { EnvironmentDetailsTable } from './EnvironmentDetailsTable';
import { RecipeTable } from '../recipes/RecipeTable';
import { Grid } from '@material-ui/core';

export const EnvironmentOverviewTab = (props: {
  environment: Resource<EnvironmentProperties>;
}) => {
  return (
    <Grid container spacing={3} direction="column">
      <Grid item>
        <EnvironmentDetailsTable environment={props.environment} />
      </Grid>
      <Grid item>
        <RecipeTable environment={props.environment} title="Recipes" />
      </Grid>
    </Grid>
  );
};
