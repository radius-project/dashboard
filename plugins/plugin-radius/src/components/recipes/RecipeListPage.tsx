import React, { useCallback, useMemo, useState } from 'react';
import {
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Typography,
} from '@material-ui/core';
import { Header, Page, Content } from '@backstage/core-components';
import { radiusApiRef } from '../../api/ref';
import {
  EnvironmentProperties,
  RecipePackProperties,
  Resource,
} from '../../resources';
import { useApi } from '@backstage/core-plugin-api';
import { RecipeTable } from './RecipeTable';
import { aggregateRecipesFromEnvironment } from './recipeAggregation';
import { RadiusListResult } from '../../api';
import { ResourceQueryResult } from '../queryresult/ResourceQueryResult';
import { withRadiusTheme } from '../../appearance';
import { useInventoryQuery } from '../queryresult/useInventoryQuery';
import { loadRecipePacks } from './loadRecipePacks';

export const RecipeListPageContent2 = ({
  environments,
  packsById,
}: {
  environments: Resource<EnvironmentProperties>[];
  packsById: Record<string, Resource<RecipePackProperties>>;
}) => {
  const first = environments.length > 0 ? environments[0].id : undefined;

  const [selected, setSelected] = useState(first);

  const env = environments.find(e => e.id === selected) ?? environments[0];

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
            value={env?.id ?? ''}
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
  const { value, loading, error, retry } = useInventoryQuery(
    useCallback(async (): Promise<{
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

      const { packsById, errors: packErrors } = await loadRecipePacks(
        radiusApi,
        packIds,
      );
      const errors = [...(environments.errors ?? []), ...packErrors];

      return {
        environments: errors.length
          ? { ...environments, complete: false, errors }
          : environments,
        packsById,
      };
    }, [radiusApi]),
  );

  const loadedPackIds = new Set(
    Object.keys(value?.packsById ?? {}).map(id => id.toLowerCase()),
  );

  return (
    <ResourceQueryResult
      loading={loading}
      error={error}
      retry={retry}
      result={
        value && {
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
        }
      }
    >
      <RecipeListPageContent2
        environments={value?.environments.value ?? []}
        packsById={value?.packsById ?? {}}
      />
    </ResourceQueryResult>
  );
};

export const RecipeListPage = withRadiusTheme(() => {
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
});
