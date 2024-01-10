import React, { useState } from 'react';
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
import { radiusApiRef } from '../../plugin';
import { EnvironmentProperties, Resource, ResourceList } from '../../resources';
import { useApi } from '@backstage/core-plugin-api';
import useAsync from 'react-use/lib/useAsync';
import { RecipeTable } from './RecipeTable';

export const RecipeListPageContent2 = ({
  environments,
}: {
  environments: Resource<EnvironmentProperties>[];
}) => {
  const first = environments.length > 0 ? environments[0].id : undefined;

  const [selected, setSelected] = useState(first);

  const env = environments.find(e => e.id === selected);

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
          <RecipeTable environment={env} />
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
  const { value, loading, error } = useAsync(
    async (): Promise<ResourceList<EnvironmentProperties>> =>
      radiusApi.listEnvironments(),
    [],
  );

  if (loading) {
    return <Progress data-testid="progress" />;
  } else if (error) {
    return <ResponseErrorPanel error={error} />;
  }

  if (!value) {
    throw new Error('This should not happen.');
  }

  return <RecipeListPageContent2 environments={value.value} />;
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
