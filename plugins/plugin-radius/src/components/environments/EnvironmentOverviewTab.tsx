import React, { useMemo } from 'react';
import {
  EnvironmentProperties,
  RecipePackProperties,
  Resource,
} from '../../resources';
import { EnvironmentDetailsTable } from './EnvironmentDetailsTable';
import { RecipeTable } from '../recipes/RecipeTable';
import { aggregateRecipesFromEnvironment } from '../recipes/recipeAggregation';
import { Grid } from '@material-ui/core';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import useAsync from 'react-use/lib/useAsync';
import { radiusApiRef } from '../../plugin';

export const EnvironmentOverviewTab = (props: {
  environment: Resource<EnvironmentProperties>;
}) => {
  const radiusApi = useApi(radiusApiRef);
  const packIds = useMemo(
    () => props.environment.properties?.recipePacks ?? [],
    [props.environment],
  );
  const needsPacks = packIds.length > 0;

  // Recipe packs are not embedded in the environment resource. The environment
  // only stores the pack ids; fetch each one individually via getResourceById.
  const { value, loading, error } = useAsync(async (): Promise<
    Record<string, Resource<RecipePackProperties>>
  > => {
    if (!needsPacks) {
      return {};
    }
    const results = await Promise.allSettled(
      packIds.map(id =>
        radiusApi.getResourceById<RecipePackProperties>({ id }),
      ),
    );
    const map: Record<string, Resource<RecipePackProperties>> = {};
    for (const result of results) {
      if (result.status === 'fulfilled') {
        map[result.value.id] = result.value;
      }
    }
    return map;
  }, [needsPacks, packIds.join(',')]);

  const recipes = useMemo(
    () => aggregateRecipesFromEnvironment(props.environment, value ?? {}),
    [props.environment, value],
  );

  return (
    <Grid container spacing={3} direction="column">
      <Grid item>
        <EnvironmentDetailsTable environment={props.environment} />
      </Grid>
      <Grid item>
        {needsPacks && loading ? (
          <Progress data-testid="progress" />
        ) : error ? (
          <ResponseErrorPanel error={error} />
        ) : (
          <RecipeTable recipes={recipes} title="Recipes" />
        )}
      </Grid>
    </Grid>
  );
};
