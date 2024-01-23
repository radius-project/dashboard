import React from 'react';
import { Grid, Typography, Box } from '@material-ui/core';
import {
  Header,
  Page,
  Content,
  Breadcrumbs,
  Link,
} from '@backstage/core-components';
import { ResourceTable } from '../resourcetable';

export const EnvironmentListPage = () => (
  <Page themeId="radius-environment-list">
    <Header
      title="Environments"
      subtitle="Displaying environments where applications can be deployed."
    />
    <Content>
      <Box mb={3}>
        <Breadcrumbs aria-label="breadcrumb">
          <Link to="/">Home</Link>
          <Typography>Environments</Typography>
        </Breadcrumbs>
      </Box>
      <Grid container spacing={3} direction="column">
        <Grid item>
          <ResourceTable
            title="Environments"
            resourceType="Applications.Core/environments"
          />
        </Grid>
      </Grid>
    </Content>
  </Page>
);
