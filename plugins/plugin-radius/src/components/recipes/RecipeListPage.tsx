import React, { useMemo, useState } from 'react';
import {
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Typography,
} from '@material-ui/core';
import {
  Header,
  Page,
  Content,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import { radiusApiRef } from '../../api/ref';
import {
  EnvironmentProperties,
  RecipePackProperties,
  Resource,
} from '../../resources';
import { useApi } from '@backstage/core-plugin-api';
import useAsync from 'react-use/lib/useAsync';
import { RecipeTable } from './RecipeTable';
import { aggregateRecipesFromEnvironment } from './recipeAggregation';
import { RadiusListResult } from '../../api';
import { ResourceQueryResult } from '../queryresult/ResourceQueryResult';

export const RecipeListPageContent2 = ({
  environments,
  packsById,
}: {
  environments: Resource<EnvironmentProperties>[];
  packsById: Record<string, Resource<RecipePackProperties>>;
}) => {
  const first = environments.length > 0 ? environments[0].id : undefined;

  const [selected, setSelected] = useState(first);

  const env = environments.find(e => e.id === selected);

  const recipes = useMemo(
    () => (env ? aggregateRecipesFromEnvironment(env, packsById) : []),
    [env, packsById],
  );

  return (
    <>
      <Grid container item xs={12}>
        <FormControl fullWidth>
          <InputLabel id="recipes-select-environment">Environment</InputLabel>

          <Select
            labelId="recipes-select-environment"
            defaultValue={first}
            onChange={evt => setSelected(evt.target.value as string)}
          >
            {environments.map((resource: Resource<EnvironmentProperties>) => {
              return (
                <MenuItem key={resource.id} value={resource.id}>
                  {resource.name}
                </MenuItem>
              );
            })}
          </Select>
        </FormControl>
      </Grid>
      <Grid item>
        {env ? (
          <RecipeTable recipes={recipes} />
        ) : (
          <Typography variant="h6">
            Select an environment to display recipes.
          </Typography>
        )}
      </Grid>
    </>
  );
};

export const RecipeListPageContent = () => {
  const radiusApi = useApi(radiusApiRef);
  const { value, loading, error } = useAsync(async (): Promise<{
    environments: RadiusListResult<EnvironmentProperties>;
    packsById: Record<string, Resource<RecipePackProperties>>;
  }> => {
    const environments = await radiusApi.listEnvironments();

    // Collect every recipe pack id referenced by any environment, then fetch
    // each pack individually via getResourceById. Recipe packs are not part of
    // the environment resource itself — the environment only carries the ids.
    const packIds = new Set<string>();
    for (const env of environments.value) {
      for (const id of env.properties?.recipePacks ?? []) {
        packIds.add(id);
      }
    }

    const requestedPacks = Array.from(packIds);
    const packResults = await Promise.allSettled(
      requestedPacks.map(id =>
        radiusApi.getResourceById<RecipePackProperties>({ id }),
      ),
    );

    const packsById: Record<string, Resource<RecipePackProperties>> = {};
    const errors = [...(environments.errors ?? [])];
    for (const [index, result] of packResults.entries()) {
      if (result.status === 'fulfilled') {
        packsById[result.value.id] = result.value;
      } else {
        errors.push({
          resourceId: requestedPacks[index],
          error: result.reason,
        });
      }
    }

    return {
      environments: errors.length
        ? { ...environments, complete: false, errors }
        : environments,
      packsById,
    };
  }, [radiusApi]);

  if (loading) {
    return <Progress data-testid="progress" />;
  } else if (error) {
    return <ResponseErrorPanel error={error} />;
  }

  if (!value) {
    throw new Error('This should not happen.');
  }

  const loadedPackIds = new Set(
    Object.keys(value.packsById).map(id => id.toLowerCase()),
  );

  return (
    <ResourceQueryResult
      result={{
        ...value.environments,
        // Environments without recipes are still data. Only missing packs
        // (no recipes can be shown) make the result unusable.
        value: value.environments.value.filter(
          environment =>
            !environment.properties?.recipePacks?.length ||
            environment.properties.recipePacks.some(id =>
              loadedPackIds.has(id.toLowerCase()),
            ) ||
            aggregateRecipesFromEnvironment(environment, value.packsById)
              .length > 0,
        ),
      }}
    >
      <RecipeListPageContent2
        environments={value.environments.value}
        packsById={value.packsById}
      />
    </ResourceQueryResult>
  );
};

export const RecipeListPage = () => {
  return (
    <Page themeId="radius-recipe-list">
      <Header
        title="Recipes"
        subtitle="Displaying recipes to create cloud infrastructure."
      />
      <Content>
        <Grid container spacing={3} direction="column">
          <RecipeListPageContent />
        </Grid>
      </Content>
    </Page>
  );
};
