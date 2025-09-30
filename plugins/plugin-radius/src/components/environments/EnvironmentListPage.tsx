import React, { useState, useEffect } from 'react';
import { 
  Grid, 
  Typography, 
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
} from '@material-ui/core';
import {
  Header,
  Page,
  Content,
  Breadcrumbs,
  Link,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import { ResourceTable } from '../resourcetable';
import { useApi } from '@backstage/core-plugin-api';
import useAsync from 'react-use/lib/useAsync';
import { radiusApiRef } from '../../plugin';
import { ResourceList, Resource } from '../../resources';
import { parseResourceId } from '@radapp.io/rad-components';

const EnvironmentListPageContent = ({ 
  environments 
}: { 
  environments: Resource[] 
}) => {
  // Extract unique resource groups and sort them in ascending order
  const resourceGroups = Array.from(
    new Set(
      environments
        .map(env => parseResourceId(env.id)?.group)
        .filter((group): group is string => !!group)
    )
  ).sort((a, b) => a.localeCompare(b));

  const allGroupsOption = 'all';
  const storageKey = 'radius-environment-filter-resource-group';
  
  // Initialize state from localStorage or default to 'all'
  const [selectedGroup, setSelectedGroup] = useState<string>(() => {
    const saved = localStorage.getItem(storageKey);
    return saved || allGroupsOption;
  });

  // Save to localStorage whenever the selection changes
  useEffect(() => {
    localStorage.setItem(storageKey, selectedGroup);
  }, [selectedGroup]);

  const handleGroupChange = (value: string) => {
    setSelectedGroup(value);
  };

  return (
    <>
      <Box mb={3}>
        <Breadcrumbs aria-label="breadcrumb">
          <Link to="/">Home</Link>
          <Typography>Environments</Typography>
        </Breadcrumbs>
      </Box>
      <Grid container spacing={3} direction="column">
        {resourceGroups.length > 0 && (
          <Grid item xs={12}>
            <FormControl fullWidth>
              <InputLabel id="environment-filter-resource-group">
                Filter by Resource Group
              </InputLabel>
              <Select
                labelId="environment-filter-resource-group"
                value={selectedGroup}
                onChange={evt => handleGroupChange(evt.target.value as string)}
                style={{ fontSize: '0.875rem' }}
              >
                <MenuItem value={allGroupsOption} style={{ fontSize: '0.875rem' }}>
                  All Resource Groups
                </MenuItem>
                {resourceGroups.map(group => (
                  <MenuItem key={group} value={group} style={{ fontSize: '0.875rem' }}>
                    {group}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        )}
        <Grid item>
          <ResourceTable
            title="Environments"
            resourceType="Applications.Core/environments"
            resourceGroupFilter={selectedGroup === allGroupsOption ? undefined : selectedGroup}
          />
        </Grid>
      </Grid>
    </>
  );
};

export const EnvironmentListPage = () => {
  const radiusApi = useApi(radiusApiRef);
  const { value, loading, error } = useAsync(
    async (): Promise<ResourceList<{ [key: string]: unknown }>> =>
      radiusApi.listResources<{ [key: string]: unknown }>({
        resourceType: 'Applications.Core/environments',
      }),
    [],
  );

  if (loading) {
    return (
      <Page themeId="radius-environment-list">
        <Header
          title="Environments"
          subtitle="Displaying environments where applications can be deployed."
        />
        <Content>
          <Progress data-testid="progress" />
        </Content>
      </Page>
    );
  } else if (error) {
    return (
      <Page themeId="radius-environment-list">
        <Header
          title="Environments"
          subtitle="Displaying environments where applications can be deployed."
        />
        <Content>
          <ResponseErrorPanel error={error} />
        </Content>
      </Page>
    );
  }

  return (
    <Page themeId="radius-environment-list">
      <Header
        title="Environments"
        subtitle="Displaying environments where applications can be deployed."
      />
      <Content>
        <EnvironmentListPageContent environments={value?.value || []} />
      </Content>
    </Page>
  );
};
