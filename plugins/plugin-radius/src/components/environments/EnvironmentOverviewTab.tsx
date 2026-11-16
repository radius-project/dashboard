import React, { useCallback, useMemo } from 'react';
import { EnvironmentProperties, Resource } from '../../resources';
import { EnvironmentDetailsTable } from './EnvironmentDetailsTable';
import { RecipeTable } from '../recipes/RecipeTable';
import { aggregateRecipesFromEnvironment } from '../recipes/recipeAggregation';
import { Grid } from '@material-ui/core';
import { useApi } from '@backstage/core-plugin-api';
import { radiusApiRef } from '../../api/ref';
import { useInventoryQuery } from '../queryresult/useInventoryQuery';
import { ResourceQueryResult } from '../queryresult/ResourceQueryResult';
import { loadRecipePacks } from '../recipes/loadRecipePacks';

export const EnvironmentOverviewTab = (props: {
  environment: Resource<EnvironmentProperties>;
}) => {
  const radiusApi = useApi(radiusApiRef);
  const packIds = useMemo(
    () => props.environment.properties?.recipePacks ?? [],
    [props.environment],
  );
  const { value, loading, error, retry } = useInventoryQuery(
    useCallback(
      () => loadRecipePacks(radiusApi, packIds),
      [radiusApi, packIds],
    ),
  );

  const recipes = useMemo(
    () =>
      aggregateRecipesFromEnvironment(
        props.environment,
        value?.packsById ?? {},
      ),
    [props.environment, value],
  );

  return (
    <Grid container spacing={3} direction="column">
      <Grid item>
        <EnvironmentDetailsTable environment={props.environment} />
      </Grid>
      <Grid item>
        <ResourceQueryResult
          result={
            value && {
              value: [...recipes, ...Object.values(value.packsById)],
              complete: !value.errors.length,
              errors: value.errors,
            }
          }
          loading={loading}
          error={error}
          retry={retry}
        >
          <RecipeTable recipes={recipes} title="Recipes" />
        </ResourceQueryResult>
      </Grid>
    </Grid>
  );
};
