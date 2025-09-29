import React from 'react';
import { Grid, Typography, Box } from '@material-ui/core';
import {
  Header,
  Page,
  Content,
  Breadcrumbs,
  Link,
} from '@backstage/core-components';
import { ResourceTypesTable } from './ResourceTypesTable';

export const ResourceTypesListPage = () => (
  <Page themeId="radius-resource-types-list">
    <Header
      title="Resource Types"
      subtitle="Resource types available for building applications."
    />
    <Content>
      <Box mb={3}>
        <Breadcrumbs aria-label="breadcrumb">
          <Link to="/">Home</Link>
          <Typography>Resource Types</Typography>
        </Breadcrumbs>
      </Box>
      <Grid container spacing={3} direction="column">
        <Grid item>
          <ResourceTypesTable title="Resource Types" />
        </Grid>
      </Grid>
    </Content>
  </Page>
);
